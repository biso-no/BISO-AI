import { SharePointService, SharePointDocument } from './sharepoint';
import { DocumentProcessor, ProcessedDocument } from './document-processor';
import { isSupportedContentType } from './content-types';
import { correctMimeType } from './mime-utils';
import { VectorDocument } from './vector-store.types';
import { getDocumentViewerUrl } from './document-utils';
import { z } from 'zod';

export interface IndexingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  siteId: string;
  siteName: string;
  folderPath: string;
  recursive: boolean;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
}

export interface IndexingOptions {
  siteId: string;
  folderPath?: string;
  recursive?: boolean;
  batchSize?: number;
  maxConcurrency?: number;
}

export interface ProcessedDocumentResult {
  documentId: string;
  chunks: VectorDocument[];
  error?: string;
}

export class IndexingService {
  private sharePointService: SharePointService;
  private documentProcessor: DocumentProcessor;
  private vectorStore: import('./vector-store.types').IVectorStore;
  private jobs: Map<string, IndexingJob> = new Map();

  constructor(
    sharePointService: SharePointService, 
    vectorStore: import('./vector-store.types').IVectorStore
  ) {
    this.sharePointService = sharePointService;
    this.documentProcessor = new DocumentProcessor();
    this.vectorStore = vectorStore;
  }

  async startIndexing(options: IndexingOptions): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: IndexingJob = {
      id: jobId,
      status: 'pending',
      siteId: options.siteId,
      siteName: 'Unknown', // Will be updated during processing
      folderPath: options.folderPath || '/',
      recursive: options.recursive || false,
      totalDocuments: 0,
      processedDocuments: 0,
      failedDocuments: 0,
      startTime: new Date(),
    };

    this.jobs.set(jobId, job);

    // Start processing in background
    this.processIndexingJob(jobId, options).catch(error => {
      console.error('Indexing job failed:', error);
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.endTime = new Date();
      }
    });

    return jobId;
  }

  private async processIndexingJob(jobId: string, options: IndexingOptions): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');

    try {
      job.status = 'processing';

      // Get site information
      const sites = await this.sharePointService.listSites();
      let site = sites.find(s => s.id === options.siteId);
      if (!site) {
        try {
          site = await this.sharePointService.getSiteById(options.siteId);
        } catch {}
      }
      if (site) {
        job.siteName = site.displayName;
      }

      // List documents from SharePoint
      const documents = await this.sharePointService.listDocuments(
        options.siteId,
        options.folderPath || '/',
        options.recursive || false
      );

      // Filter unsupported content types upfront
      const supportedDocuments = documents.filter((doc) => {
        const supported = isSupportedContentType(doc.contentType, doc.name);
        if (!supported) {
          console.log(`Skipping unsupported file type: ${doc.name} (${doc.contentType})`);
        }
        return supported;
      });

      job.totalDocuments = supportedDocuments.length;
      console.log(`Found ${supportedDocuments.length} supported documents to index (out of ${documents.length} total)`);

      // Process documents in batches
      const batchSize = options.batchSize || 10;
      const maxConcurrency = options.maxConcurrency || 3;

      for (let i = 0; i < supportedDocuments.length; i += batchSize) {
        const batch = supportedDocuments.slice(i, i + batchSize);
        
        // Process batch with concurrency limit
        const promises = batch.map(doc => this.processDocument(doc, jobId));
        const results = await Promise.allSettled(promises);
        
        // Update job progress
        for (const result of results) {
          if (result.status === 'fulfilled') {
            job.processedDocuments++;
          } else {
            job.failedDocuments++;
            console.error('Document processing failed:', result.reason);
          }
        }

        // Add small delay between batches to avoid overwhelming SharePoint
        if (i + batchSize < supportedDocuments.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      job.status = 'completed';
      job.endTime = new Date();
      console.log(`Indexing job ${jobId} completed successfully`);

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.endTime = new Date();
      throw error;
    }
  }

  private async processDocument(
    document: SharePointDocument, 
    jobId: string
  ): Promise<ProcessedDocumentResult> {
    try {
      // Correct MIME type if it's generic
      const correctedContentType = correctMimeType(document.contentType, document.name);
      
      // Guard at document level as well
      if (!isSupportedContentType(correctedContentType, document.name)) {
        return {
          documentId: document.id,
          chunks: [],
          error: `Unsupported content type: ${correctedContentType} (original: ${document.contentType})`,
        };
      }

      // Download document content from SharePoint
      const buffer = await this.sharePointService.downloadDocument(document.driveId, document.id);
      
      // Process document to extract text and create chunks
      const processed = await this.documentProcessor.processDocument(
        buffer,
        correctedContentType,
        document.metadata
      );

      // Generate the document viewer URL using fileName
      const documentViewerUrl = getDocumentViewerUrl({ 
        fileName: document.name,
        baseUrl: process.env.NEXT_PUBLIC_APP_URL 
      });

      // Prepare documents for vector store with updated metadata
      const vectorDocuments: VectorDocument[] = processed.chunks.map(chunk => ({
        id: `${document.id}_chunk_${chunk.chunkIndex}`,
        content: chunk.content,
        metadata: {
          ...chunk.metadata,
          documentId: document.id,
          documentName: document.name,
          fileName: document.name,
          siteId: document.siteId,
          siteName: document.siteName,
          driveId: document.driveId, // Store driveId for later retrieval
          webUrl: document.webUrl, // Keep original SharePoint URL for reference
          documentViewerUrl, // Add new document viewer URL
          contentType: correctedContentType,
          fileSize: document.size,
          lastModified: document.lastModified,
          createdBy: document.createdBy,
          jobId,
        },
      }));

      // Add to vector store
      await this.vectorStore.addDocuments(vectorDocuments);

      console.log(`Processed document: ${document.name} (${processed.chunks.length} chunks)`);

      return {
        documentId: document.id,
        chunks: vectorDocuments,
      };

    } catch (error) {
      console.error(`Failed to process document ${document.name}:`, error);
      return {
        documentId: document.id,
        chunks: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getJobStatus(jobId: string): Promise<IndexingJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async listJobs(): Promise<IndexingJob[]> {
    return Array.from(this.jobs.values());
  }

  async searchDocuments(query: string, options: {
    k?: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
  } = {}): Promise<any[]> {
    const results = await this.vectorStore.search({
      query,
      k: options.k || 5,
      filter: options.filter,
      includeMetadata: options.includeMetadata !== false,
    });

    return results.map(result => ({
      ...result,
      source: result.metadata.documentViewerUrl || result.metadata.webUrl, // Prefer viewer URL
      title: result.metadata.documentName,
      site: result.metadata.siteName,
      lastModified: result.metadata.lastModified,
      documentViewerUrl: result.metadata.documentViewerUrl,
      webUrl: result.metadata.webUrl, // Keep original for reference
    }));
  }

  async getDocumentStats(): Promise<{ totalDocuments: number; totalChunks: number }> {
    const stats = await this.vectorStore.getCollectionStats();
    return {
      totalDocuments: stats.count,
      totalChunks: stats.count, // In our case, each chunk is stored as a separate document
    };
  }

  async clearIndex(): Promise<void> {
    await this.vectorStore.clearCollection();
    this.jobs.clear();
    console.log('Index cleared successfully');
  }

  async reindexDocument(documentId: string, siteId: string, driveId: string): Promise<void> {
    try {
      // Get document from SharePoint
      const documents = await this.sharePointService.listDocuments(siteId, '/', false);
      const document = documents.find(doc => doc.id === documentId);
      
      if (!document) {
        throw new Error('Document not found');
      }

      // Ensure driveId is set
      document.driveId = driveId;

      // Remove existing chunks from vector store
      const existingChunks = await this.vectorStore.search({
        query: '', // Empty query to get all
        filter: { documentId },
        k: 1000,
      });

      if (existingChunks.length > 0) {
        const chunkIds = existingChunks.map(chunk => chunk.id);
        await this.vectorStore.deleteDocuments(chunkIds);
      }

      // Process and reindex document
      const jobId = `reindex_${Date.now()}`;
      await this.processDocument(document, jobId);

      console.log(`Document ${documentId} reindexed successfully`);

    } catch (error) {
      console.error(`Failed to reindex document ${documentId}:`, error);
      throw error;
    }
  }
}

// Factory function to create indexing service without Appwrite
export async function createIndexingService(): Promise<IndexingService> {
  const { getSharePointConfig } = await import('./sharepoint');
  const { getVectorStore } = await import('./vector-store-factory');
  
  const config = getSharePointConfig();
  const sharePointService = new SharePointService(config);
  const vectorStore = await getVectorStore();
  
  return new IndexingService(sharePointService, vectorStore);
}
