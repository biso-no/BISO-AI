import { IVectorStore, VectorDocument, SearchOptions, SearchResult } from './vector-store.types';
import { QdrantClient } from '@qdrant/js-client-rest';
import { embed, embedMany } from 'ai';
import { openai } from './ai';
import { v5 as uuidv5 } from 'uuid';

const embeddingModel = openai.textEmbeddingModel('text-embedding-3-small');

export class QdrantVectorStore implements IVectorStore {
  private client: QdrantClient;
  private collectionName: string;

  constructor(collectionName: string = 'sharepoint_documents') {
    this.collectionName = collectionName;
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });
  }

  async initialize(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections?.some(c => c.name === this.collectionName);
      const vectorSize = 1536; // text-embedding-3-small dimension
      
      if (!exists) {
        console.log(`Creating Qdrant collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: { size: vectorSize, distance: 'Cosine' },
        });
        console.log(`Collection ${this.collectionName} created successfully`);
      } else {
        // Verify collection configuration
        const collectionInfo = await this.client.getCollection(this.collectionName);
        const currentVectorSize = collectionInfo.config?.params?.vectors?.size;
        
        if (currentVectorSize && currentVectorSize !== vectorSize) {
          console.warn(`Collection ${this.collectionName} has vector size ${currentVectorSize}, expected ${vectorSize}`);
          console.warn('Consider recreating the collection or adjusting the embedding model');
        }
      }
    } catch (error) {
      console.error('Error initializing Qdrant collection:', error);
      throw error;
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!documents.length) return;

    // Normalize, truncate, and filter out invalid inputs for embeddings
    const MAX_CHARS_PER_INPUT = 24000; // conservative char cap to stay under token limits
    const items = documents
      .map((doc) => {
        const raw = typeof doc.content === 'string' ? doc.content : String(doc.content ?? '');
        const normalized = raw.trim();
        const truncated = normalized.length > MAX_CHARS_PER_INPUT
          ? normalized.slice(0, MAX_CHARS_PER_INPUT)
          : normalized;
        return { doc, text: truncated };
      })
      .filter((it) => it.text.length > 0);

    if (items.length === 0) return;

    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: items.map((it) => it.text),
    });

    // Create a namespace UUID for SharePoint documents
    const SHAREPOINT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    
    const points = items.map((it, idx) => {
      // Generate a deterministic UUID from the original ID
      // This ensures the same document always gets the same UUID
      const pointId = uuidv5(it.doc.id, SHAREPOINT_NAMESPACE);
      
      console.log(`Generated UUID for document: ${it.doc.id.substring(0, 30)}... -> ${pointId}`);
      
      // Validate embedding vector
      if (!Array.isArray(embeddings[idx]) || embeddings[idx].length !== 1536) {
        console.error(`Invalid embedding for document ${it.doc.id}: expected 1536 dimensions, got ${embeddings[idx]?.length}`);
        return null;
      }
      
      return {
        id: pointId,
        vector: embeddings[idx],
        payload: { 
          ...it.doc.metadata, 
          text: it.text,
          originalId: it.doc.id // Store original ID in payload
        },
      };
    }).filter(point => point !== null);

    if (points.length === 0) {
      console.warn('No valid points to upsert after filtering');
      return;
    }

    try {
      await this.client.upsert(this.collectionName, { wait: true, points });
    } catch (error: any) {
      console.error('Qdrant upsert error:', error);
      console.error('Error details:', error.data || error.response?.data);
      
      // Log the first point for debugging
      if (points.length > 0) {
        const firstPoint = points[0];
        console.error('Sample point structure:', {
          id: firstPoint.id,
          vectorLength: firstPoint.vector?.length,
          payloadKeys: Object.keys(firstPoint.payload || {}),
        });
      }
      
      throw error;
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, k = 5, filter } = options;
    
    // If no query is provided and we only have filters, just do a filter-based search
    if (!query && filter) {
      const filterConditions = {
        must: Object.entries(filter).map(([key, value]) => ({ 
          key, 
          match: { value } 
        }))
      };

      // Use scroll to get points matching the filter without vector search
      const scrollResult = await this.client.scroll(this.collectionName, {
        filter: filterConditions,
        limit: k,
        with_payload: true,
        with_vector: false,
      });

      return scrollResult.points.map((res, i) => ({
        id: (res.payload?.originalId as string) || String(res.id ?? `result_${i}`),
        content: (res.payload?.text as string) || '',
        metadata: res.payload || {},
        score: 1, // No similarity score for filter-only search
        distance: 0,
      }));
    }

    // Normal semantic search with embeddings
    const { embedding: vector } = await embed({
      model: embeddingModel,
      value: query,
    });

    const search = await this.client.search(this.collectionName, {
      vector,
      limit: k,
      with_payload: true,
      with_vector: false,
      ...(filter ? { filter: { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) } } : {}),
    });

    return search.map((res, i) => ({
      // Use originalId from payload if available, otherwise use the stored ID
      id: (res.payload?.originalId as string) || String(res.id ?? `result_${i}`),
      content: (res.payload?.text as string) || '',
      metadata: res.payload || {},
      score: typeof res.score === 'number' ? res.score : 0,
      distance: 1 - (typeof res.score === 'number' ? res.score : 0),
    }));
  }

  // New method for keyword-based search with larger result set for filtering
  async searchBroad(query: string, limit: number): Promise<SearchResult[]> {
    const { embedding: vector } = await embed({
      model: embeddingModel,
      value: query,
    });

    const search = await this.client.search(this.collectionName, {
      vector,
      limit: Math.min(limit, 1000), // Cap at 1000 to avoid performance issues
      with_payload: true,
      with_vector: false,
      score_threshold: 0.1, // Lower threshold to get more results for filtering
    });

    return search.map((res, i) => ({
      id: (res.payload?.originalId as string) || String(res.id ?? `result_${i}`),
      content: (res.payload?.text as string) || '',
      metadata: res.payload || {},
      score: typeof res.score === 'number' ? res.score : 0,
      distance: 1 - (typeof res.score === 'number' ? res.score : 0),
    }));
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (!ids.length) return;
    
    const SHAREPOINT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    
    // Convert original IDs to UUIDs for deletion
    const convertedIds = ids.map(id => uuidv5(id, SHAREPOINT_NAMESPACE));
    
    await this.client.delete(this.collectionName, { points: convertedIds });
  }

  async updateDocument(id: string, content: string, metadata: Record<string, any>): Promise<void> {
    const SHAREPOINT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const pointId = uuidv5(id, SHAREPOINT_NAMESPACE);
    
    const { embedding } = await embed({
      model: embeddingModel,
      value: content,
    });
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [{ 
        id: pointId, 
        vector: embedding, 
        payload: { ...metadata, text: content, originalId: id } 
      }],
    });
  }

  async getCollectionStats(): Promise<{ count: number }> {
    const info = await this.client.count(this.collectionName, { exact: true });
    return { count: info.count || 0 };
  }

  async clearCollection(): Promise<void> {
    await this.client.deleteCollection(this.collectionName);
    await this.initialize();
  }
}
