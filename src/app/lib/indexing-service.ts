import { SharePointService, SharePointDocument } from './sharepoint';
import { DocumentProcessor, ProcessedDocument } from './document-processor';
import { isSupportedContentType } from './content-types';
import { correctMimeType } from './mime-utils';
import { VectorDocument } from './vector-store.types';
import { getDocumentViewerUrl } from './document-utils';
import { documentClassifier, DocumentClassification } from './document-classifier';
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

      // Filter unsupported content types upfront (e.g., video/mp4)
      const supportedDocuments = documents.filter((doc) => {
        const supported = isSupportedContentType(doc.contentType, doc.name);
        if (!supported) {
          console.log(`Skipping unsupported file type: ${doc.name} (${doc.contentType})`);
        }
        return supported;
      });

      // Apply intelligent document filtering and prioritization
      const prioritizedDocuments = this.prioritizeDocuments(supportedDocuments);

      job.totalDocuments = prioritizedDocuments.length;
      console.log(`Found ${prioritizedDocuments.length} prioritized documents to index (out of ${documents.length} total)`);
      console.log(`Language/version filtering applied: ${supportedDocuments.length} -> ${prioritizedDocuments.length}`);

      // Process documents in batches
      const batchSize = options.batchSize || 10;
      const maxConcurrency = options.maxConcurrency || 3;

      for (let i = 0; i < prioritizedDocuments.length; i += batchSize) {
        const batch = prioritizedDocuments.slice(i, i + batchSize);
        
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
        if (i + batchSize < prioritizedDocuments.length) {
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

  private prioritizeDocuments(documents: SharePointDocument[]): SharePointDocument[] {
    // Group documents by base name (without version) to find related versions
    const documentGroups = new Map<string, SharePointDocument[]>();
    
    documents.forEach(doc => {
      // Create a base name by removing version patterns
      const baseName = this.getDocumentBaseName(doc.name);
      const key = `${baseName}_${doc.folderPath}`.toLowerCase();
      
      if (!documentGroups.has(key)) {
        documentGroups.set(key, []);
      }
      documentGroups.get(key)!.push(doc);
    });

    const prioritizedDocuments: SharePointDocument[] = [];
    let totalFiltered = 0;

    // For each group, select the most authoritative document(s)
    for (const [groupKey, groupDocs] of documentGroups) {
      if (groupDocs.length === 1) {
        // Single document, include it
        prioritizedDocuments.push(groupDocs[0]);
      } else {
        // Multiple documents, apply prioritization
        const classified = groupDocs.map(doc => ({
          doc,
          classification: documentClassifier.classifyDocument(
            doc.name, 
            doc.folderPath || '/'
          )
        }));

        // Sort by authority priority
        classified.sort((a, b) => 
          documentClassifier.compareAuthority(a.classification, b.classification)
        );

        // Include the most authoritative document
        const mostAuthoritative = classified[0];
        prioritizedDocuments.push(mostAuthoritative.doc);

        // Also include English version if Norwegian is primary and English exists
        if (mostAuthoritative.classification.language === 'norwegian') {
          const englishVersion = classified.find(c => 
            c.classification.language === 'english' && c.classification.authority.isTranslation
          );
          if (englishVersion) {
            prioritizedDocuments.push(englishVersion.doc);
          }
        }

        totalFiltered += groupDocs.length - 1;
        
        console.log(`Group ${groupKey}: Selected ${mostAuthoritative.doc.name} (priority: ${mostAuthoritative.classification.authority.priority}) from ${groupDocs.length} versions`);
      }
    }

    console.log(`Document prioritization: ${documents.length} -> ${prioritizedDocuments.length} (filtered ${totalFiltered} outdated/duplicate versions)`);
    return prioritizedDocuments;
  }

  private getDocumentBaseName(fileName: string): string {
    // Remove version patterns and language indicators
    return fileName
      .replace(/\s*v\d+(\.\d+)*(\.\d+)*/gi, '') // Remove version patterns
      .replace(/\s*(nor|norsk|eng|english)\s*/gi, '') // Remove language indicators
      .replace(/\s*\([^)]*\)\s*/g, '') // Remove content in parentheses
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
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

      // Classify the document for language, version, and authority
      const classification = documentClassifier.classifyDocument(
        document.name,
        document.folderPath || '/',
        processed.content.substring(0, 5000) // Use content sample for better classification
      );

      // Generate the document viewer URL using fileName
      const documentViewerUrl = getDocumentViewerUrl({ 
        fileName: document.name,
        baseUrl: process.env.NEXT_PUBLIC_APP_URL 
      });

      // Prepare documents for vector store with enhanced metadata
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
          // Enhanced metadata from classification
          documentLanguage: classification.language,
          documentVersion: classification.version.version,
          versionMajor: classification.version.major,
          versionMinor: classification.version.minor,
          isAuthoritative: classification.authority.isAuthoritative,
          isLatest: classification.authority.isLatest,
          isTranslation: classification.authority.isTranslation,
          authorityPriority: classification.authority.priority,
          documentCategory: classification.path.category,
          isInLanguageFolder: classification.path.isInLanguageFolder,
          languageFolder: classification.path.languageFolder,
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
    const k = options.k || 5;

    // Detect query language and derive category/campus context
    const queryLanguage = documentClassifier.detectQueryLanguage(query);
    const qLower = query.toLowerCase();

    // Category detection (statutes vs local laws)
    const isStatutes = /(vedtekt|vedtektene|statute|statutes)/i.test(query);
    const isLocalLaws = /(lokal(e)?\s+lov(er)?|local\s+law(s)?)/i.test(query);
    const detectedCategory = isStatutes ? 'statutes' : (isLocalLaws ? 'local-laws' : undefined);

    // Campus detection (simple list; extend as needed)
    const campusCandidates = ['oslo', 'bergen', 'trondheim', 'stavanger', 'drammen', 'kristiansand', 'ålesund', 'alesund', 'bodø', 'bodoe'];
    const detectedCampus = campusCandidates.find(c => qLower.includes(c));

    // Default filters to ensure we use authoritative latest versions
    const finalFilter: Record<string, any> = {
      ...(options.filter || {}),
      isLatest: true,
      isAuthoritative: true,
    };
    if (detectedCategory) {
      finalFilter.documentCategory = detectedCategory;
    }

    // Augment the query with document type and campus context to disambiguate short refs like "§ 6.3"
    const categoryTerm = detectedCategory === 'statutes'
      ? (queryLanguage === 'norwegian' ? 'vedtekter' : 'statutes')
      : detectedCategory === 'local-laws'
        ? (queryLanguage === 'norwegian' ? 'lokale lover' : 'local laws')
        : '';
    const campusTerm = detectedCampus ? (queryLanguage === 'norwegian' ? `campus ${detectedCampus}` : detectedCampus) : '';
    const augmentedQuery = [query, 'BISO', categoryTerm, campusTerm].filter(Boolean).join(' ').trim();

    // Detect specific patterns that need exact matching
    const patterns = {
      paragraph: /§\s*(\d+(?:\.\d+)*)/g, // Matches § 6.3, §6.3, § 6.3.1, etc.
      section: /(?:paragraf|paragraph|avsnitt|section)\s*(\d+(?:\.\d+)*)/gi,
      article: /(?:artikkel|article)\s*(\d+(?:\.\d+)*)/gi,
    };

    let hasSpecificPattern = false;
    let keywordResults: any[] = [];
    
    // Check if query contains specific patterns that need keyword matching
    for (const [patternType, regex] of Object.entries(patterns)) {
      const matches = Array.from(query.matchAll(regex));
      if (matches.length > 0) {
        hasSpecificPattern = true;
        console.log(`Detected ${patternType} pattern in query:`, matches.map(m => m[0]));
        
        // For each pattern match, do a keyword-based search
        for (const match of matches) {
          const keywordQuery = match[0]; // Use the exact match (e.g., "§ 6.3")
          const numberOnly = match[1]; // Just the number part (e.g., "6.3")
          
          // Search for documents containing this specific text
          const keywordSearchResults = await this.searchByKeyword(keywordQuery, numberOnly, k * 2, {
            category: detectedCategory,
            campus: detectedCampus,
            language: queryLanguage,
          });
          keywordResults.push(...keywordSearchResults);
        }
        break; // Only process the first pattern type found
      }
    }

    // Always do semantic search as well
    const semanticResults = await this.vectorStore.search({
      query: augmentedQuery,
      k: hasSpecificPattern ? k * 2 : k, // Get more results if we're combining with keyword search
      filter: finalFilter,
      includeMetadata: options.includeMetadata !== false,
    });

    let combinedResults;
    
    if (hasSpecificPattern && keywordResults.length > 0) {
      // Combine and deduplicate results, prioritizing keyword matches
      const resultMap = new Map();
      
      // Add keyword results first (higher priority)
      keywordResults.forEach(result => {
        if (!resultMap.has(result.id)) {
          resultMap.set(result.id, { ...result, searchType: 'keyword', originalScore: result.score });
        }
      });
      
      // Add semantic results, but boost score if they also matched keywords
      semanticResults.forEach(result => {
        const id = result.id;
        if (resultMap.has(id)) {
          // Boost score for documents that matched both keyword and semantic search
          const existing = resultMap.get(id);
          existing.score = Math.min(1.0, (existing.originalScore || 0) + result.score * 0.3);
          existing.searchType = 'hybrid';
        } else {
          resultMap.set(id, { ...result, searchType: 'semantic', originalScore: result.score });
        }
      });
      
      // Sort by score and take top k results
      combinedResults = Array.from(resultMap.values())
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, k);
        
      console.log(`Hybrid search: ${keywordResults.length} keyword + ${semanticResults.length} semantic = ${combinedResults.length} combined results`);
    } else {
      combinedResults = semanticResults.slice(0, k);
    }

    // Apply final reranking based on query relevance
    const rerankedResults = this.rerankResults(combinedResults, augmentedQuery);

    return rerankedResults.map(result => ({
      ...result,
      source: result.metadata.documentViewerUrl || result.metadata.webUrl, // Prefer viewer URL
      title: result.metadata.documentName,
      site: result.metadata.siteName,
      lastModified: result.metadata.lastModified,
      documentViewerUrl: result.metadata.documentViewerUrl,
      webUrl: result.metadata.webUrl, // Keep original for reference
    }));
  }

  private async searchByKeyword(
    keywordQuery: string,
    numberOnly: string,
    limit: number,
    context?: { category?: string; campus?: string; language?: 'norwegian' | 'english' | 'mixed' }
  ): Promise<any[]> {
    try {
      const categoryTerm = context?.category === 'statutes'
        ? (context?.language === 'norwegian' ? 'vedtekter' : 'statutes')
        : context?.category === 'local-laws'
          ? (context?.language === 'norwegian' ? 'lokale lover' : 'local laws')
          : '';
      const campusTerm = context?.campus ? (context?.language === 'norwegian' ? `campus ${context.campus}` : context.campus) : '';
      const broadQueryString = [`paragraph ${numberOnly} section ${keywordQuery}`, 'BISO', categoryTerm, campusTerm]
        .filter(Boolean)
        .join(' ');

      // Use the broad search method if available, otherwise fall back to regular search
      const broadResults = this.vectorStore.searchBroad
        ? await this.vectorStore.searchBroad(broadQueryString, limit * 5)
        : await this.vectorStore.search({
            query: broadQueryString,
            k: limit * 3,
            includeMetadata: true,
          });

      // Enhanced filtering with metadata awareness
      const keywordMatches = broadResults.filter(result => {
        const text = result.content.toLowerCase();
        const metadata = result.metadata || {};
        
        // Enforce metadata constraints for authority and category when provided
        if (metadata && (metadata.isLatest === false || metadata.isAuthoritative === false)) {
          return false;
        }
        if (context?.category && metadata.documentCategory && metadata.documentCategory !== context.category) {
          return false;
        }

        // Look for various forms of the paragraph reference
        const searchTerms = [
          keywordQuery.toLowerCase(),
          `§${numberOnly}`,
          `§ ${numberOnly}`,
          `paragraf ${numberOnly}`,
          `paragraph ${numberOnly}`,
          `section ${numberOnly}`,
          `avsnitt ${numberOnly}`,
          // Also try with dot variations for subsections
          `${numberOnly}.`, // e.g., "6.3."
          ` ${numberOnly} `, // surrounded by spaces
          `${numberOnly}\n`, // followed by newline
          `${numberOnly}\t`, // followed by tab
        ];
        
        // Check text content
        const textMatch = searchTerms.some(term => text.includes(term));
        
        // Check structured metadata if available
        const metadataMatch = metadata.sectionNumber && (
          metadata.sectionNumber === numberOnly ||
          metadata.sectionNumber === `§ ${numberOnly}` ||
          metadata.sectionNumber === `§${numberOnly}` ||
          metadata.sectionNumber.includes(numberOnly)
        );
        
        return textMatch || metadataMatch;
      });

      // Sort by relevance - prioritize structured chunks and exact matches
      const sortedMatches = keywordMatches.sort((a, b) => {
        const aMetadata = a.metadata || {};
        const bMetadata = b.metadata || {};
        
        // Prioritize structured chunks
        const aStructured = aMetadata.isStructured ? 1 : 0;
        const bStructured = bMetadata.isStructured ? 1 : 0;
        if (aStructured !== bStructured) return bStructured - aStructured;
        
        // Prioritize exact section number matches
        const aExactMatch = aMetadata.sectionNumber === numberOnly ? 1 : 0;
        const bExactMatch = bMetadata.sectionNumber === numberOnly ? 1 : 0;
        if (aExactMatch !== bExactMatch) return bExactMatch - aExactMatch;
        
        // Fall back to similarity score
        return (b.score || 0) - (a.score || 0);
      });

      console.log(`Keyword search for "${keywordQuery}": found ${keywordMatches.length} matches out of ${broadResults.length} candidates`);
      console.log(`Structured chunks: ${keywordMatches.filter(r => r.metadata?.isStructured).length}`);

      // Boost scores for keyword matches since they're more precise
      return sortedMatches.map(result => {
        const metadata = result.metadata || {};
        let scoreBoost = 0.3; // Base boost for keyword match
        
        // Additional boost for structured chunks
        if (metadata.isStructured) scoreBoost += 0.2;
        
        // Additional boost for exact section matches
        if (metadata.sectionNumber === numberOnly) scoreBoost += 0.3;
        
        return {
          ...result,
          score: Math.min(1.0, (result.score || 0) + scoreBoost),
        };
      }).slice(0, limit);
      
    } catch (error) {
      console.error('Keyword search failed:', error);
      return [];
    }
  }

  private rerankResults(results: any[], query: string): any[] {
    // Detect query language for language-aware ranking
    const queryLanguage = documentClassifier.detectQueryLanguage(query);
    
    // Enhanced rule-based reranking for structured and multilingual documents
    return results.sort((a, b) => {
      const aMetadata = a.metadata || {};
      const bMetadata = b.metadata || {};
      const queryLower = query.toLowerCase();

      // Factor 1: Structured content gets priority for legal/technical queries
      const aStructuredBonus = aMetadata.isStructured ? 0.2 : 0;
      const bStructuredBonus = bMetadata.isStructured ? 0.2 : 0;

      // Factor 2: Language matching (Norwegian is authoritative, match query language)
      const getLanguageScore = (metadata: any) => {
        const docLang = metadata.documentLanguage || 'unknown';
        
        // Norwegian documents get authority bonus (as per statute)
        if (docLang === 'norwegian') {
          // Extra bonus if query is also in Norwegian
          return queryLanguage === 'norwegian' ? 0.3 : 0.25;
        }
        
        // English documents get bonus if query is in English
        if (docLang === 'english' && queryLanguage === 'english') {
          return 0.2;
        }
        
        // Mixed language documents get moderate bonus
        if (docLang === 'mixed') {
          return 0.15;
        }
        
        return 0;
      };

      const aLanguageScore = getLanguageScore(aMetadata);
      const bLanguageScore = getLanguageScore(bMetadata);

      // Factor 3: Authority and version priority
      const getAuthorityScore = (metadata: any) => {
        let score = 0;
        
        if (metadata.isAuthoritative) score += 0.2;
        if (metadata.isLatest) score += 0.15;
        if (metadata.isTranslation) score -= 0.1; // Slight penalty for translations
        
        // Version-based scoring
        const priority = metadata.authorityPriority || 0;
        score += Math.min(0.3, priority / 500); // Normalize priority to max 0.3
        
        return score;
      };

      const aAuthorityScore = getAuthorityScore(aMetadata);
      const bAuthorityScore = getAuthorityScore(bMetadata);

      // Factor 4: Exact title/section matches get higher scores
      const aTitleMatch = aMetadata.sectionTitle && 
        queryLower.includes(aMetadata.sectionTitle.toLowerCase()) ? 0.15 : 0;
      const bTitleMatch = bMetadata.sectionTitle && 
        queryLower.includes(bMetadata.sectionTitle.toLowerCase()) ? 0.15 : 0;

      // Factor 5: Content length preference - not too short, not too long
      const getContentLengthScore = (content: string) => {
        const length = content.length;
        if (length < 100) return -0.1; // Too short, likely incomplete
        if (length > 3000) return -0.05; // Too long, might be too verbose
        if (length >= 500 && length <= 1500) return 0.1; // Sweet spot
        return 0;
      };

      const aLengthScore = getContentLengthScore(a.content || '');
      const bLengthScore = getContentLengthScore(b.content || '');

      // Factor 6: Recent documents get slight preference
      const getRecencyScore = (lastModified: string | undefined) => {
        if (!lastModified) return 0;
        const date = new Date(lastModified);
        const now = new Date();
        const yearsDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (yearsDiff < 1) return 0.05;
        if (yearsDiff < 3) return 0.02;
        return 0;
      };

      const aRecencyScore = getRecencyScore(aMetadata.lastModified);
      const bRecencyScore = getRecencyScore(bMetadata.lastModified);

      // Calculate final scores
      const aFinalScore = (a.score || 0) + aStructuredBonus + aLanguageScore + aAuthorityScore + aTitleMatch + aLengthScore + aRecencyScore;
      const bFinalScore = (b.score || 0) + bStructuredBonus + bLanguageScore + bAuthorityScore + bTitleMatch + bLengthScore + bRecencyScore;

      // Update the score for transparency
      a.score = aFinalScore;
      b.score = bFinalScore;

      return bFinalScore - aFinalScore;
    });
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
