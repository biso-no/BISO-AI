import { IVectorStore, VectorDocument, SearchOptions, SearchResult } from './vector-store.types';
import { QdrantClient } from '@qdrant/js-client-rest';
import { embed, embedMany } from 'ai';
import { openai } from './ai';
import { v5 as uuidv5 } from 'uuid';
import { encode } from 'gpt-tokenizer';

// Embedding model configurations
const EMBEDDING_MODELS = {
  'text-embedding-3-small': {
    vectorSize: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002,
    description: 'Fast and cost-effective for most use cases'
  },
  'text-embedding-3-large': {
    vectorSize: 3072,
    maxTokens: 8191,
    costPer1kTokens: 0.00013,
    description: 'Higher quality embeddings for complex documents'
  }
} as const;

type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

const CONFIG = {
  EMBEDDING: {
    DEFAULT_MODEL: 'text-embedding-3-large' as EmbeddingModelName,
    MAX_TOKENS_PER_REQUEST: 7000,
    MAX_TOKENS_PER_INPUT: 2000,
    MAX_ITEMS_PER_BATCH: 64,
  },
  SEARCH: {
    DEFAULT_LIMIT: 5,
    MAX_BROAD_SEARCH_LIMIT: 1000,
    MIN_SCORE_THRESHOLD: 0.1,
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 1000,
    BACKOFF_MULTIPLIER: 2,
  }
} as const;

const SHAREPOINT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

interface BatchItem {
  doc: VectorDocument;
  text: string;
  originalIndex: number;
  tokenCount: number;
}

interface ProcessingBatch {
  indices: number[];
  texts: string[];
  tokenSum: number;
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

interface ModelStats {
  model: string;
  vectorSize: number;
  estimatedCostPer1kTokens: number;
  totalTokensProcessed: number;
  estimatedCost: number;
}

export class QdrantVectorStore implements IVectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private embeddingModel: any;
  private modelConfig: typeof EMBEDDING_MODELS[EmbeddingModelName];
  private isInitialized = false;
  private stats: ModelStats;

  constructor(
    collectionName: string = 'sharepoint_documents',
    modelName: EmbeddingModelName = CONFIG.EMBEDDING.DEFAULT_MODEL
  ) {
    this.collectionName = this.sanitizeCollectionName(collectionName);
    this.modelConfig = EMBEDDING_MODELS[modelName];
    this.embeddingModel = openai.textEmbeddingModel(modelName);
    
    this.stats = {
      model: modelName,
      vectorSize: this.modelConfig.vectorSize,
      estimatedCostPer1kTokens: this.modelConfig.costPer1kTokens,
      totalTokensProcessed: 0,
      estimatedCost: 0,
    };
    
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });

    console.log(`🚀 QdrantVectorStore: ${modelName} (${this.modelConfig.vectorSize}D, gpt-tokenizer)`);
  }

  private sanitizeCollectionName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  private countTokens(text: string): number {
    return encode(text).length;
  }

  private updateStats(tokenCount: number): void {
    this.stats.totalTokensProcessed += tokenCount;
    this.stats.estimatedCost = (this.stats.totalTokensProcessed / 1000) * this.stats.estimatedCostPer1kTokens;
  }

  private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= CONFIG.RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (attempt === CONFIG.RETRY.MAX_ATTEMPTS) break;
        
        const delay = CONFIG.RETRY.INITIAL_DELAY * Math.pow(CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.withRetry(async () => {
      const collections = await this.client.getCollections();
      const exists = collections.collections?.some(c => c.name === this.collectionName);
      
      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: { 
            size: this.modelConfig.vectorSize, 
            distance: 'Cosine',
            on_disk: true,
          },
          optimizers_config: {
            default_segment_number: 2,
            memmap_threshold: 20000,
          },
        });
        console.log(`✅ Created collection: ${this.collectionName}`);
      }
    }, 'Initializing collection');
    
    this.isInitialized = true;
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!documents.length) return;
    await this.initialize();

    // Prepare documents
    const items = documents
      .map((doc, originalIndex) => {
        const text = String(doc.content || '').trim();
        if (!text) return null;
        
        const truncated = text.length > CONFIG.EMBEDDING.MAX_TOKENS_PER_INPUT * 4 
          ? text.slice(0, CONFIG.EMBEDDING.MAX_TOKENS_PER_INPUT * 4)
          : text;
        
        return {
          doc,
          text: truncated,
          originalIndex,
          tokenCount: this.countTokens(truncated)
        };
      })
      .filter((item): item is BatchItem => item !== null);

    if (!items.length) return;

    // Create batches
    const batches: ProcessingBatch[] = [];
    let current: ProcessingBatch = { indices: [], texts: [], tokenSum: 0 };

    for (const [idx, item] of items.entries()) {
      if (current.indices.length >= CONFIG.EMBEDDING.MAX_ITEMS_PER_BATCH ||
          current.tokenSum + item.tokenCount > CONFIG.EMBEDDING.MAX_TOKENS_PER_REQUEST) {
        if (current.indices.length > 0) {
          batches.push(current);
          current = { indices: [], texts: [], tokenSum: 0 };
        }
      }
      
      current.indices.push(idx);
      current.texts.push(item.text);
      current.tokenSum += item.tokenCount;
    }
    
    if (current.indices.length > 0) {
      batches.push(current);
    }

    // Generate embeddings
    const allEmbeddings: number[][] = new Array(items.length);
    
    for (const batch of batches) {
      const { embeddings } = await this.withRetry(
        () => embedMany({ model: this.embeddingModel, values: batch.texts }),
        'Generating embeddings'
      );
      
      embeddings.forEach((emb, i) => {
        allEmbeddings[batch.indices[i]] = emb as number[];
      });
      
      this.updateStats(batch.tokenSum);
    }

    // Create points
    const points: QdrantPoint[] = items.map((item, idx) => ({
      id: uuidv5(item.doc.id, SHAREPOINT_NAMESPACE),
      vector: allEmbeddings[idx],
      payload: {
        ...item.doc.metadata,
        text: item.text,
        originalId: item.doc.id,
        tokenCount: item.tokenCount,
        processingTime: new Date().toISOString(),
      },
    }));

    await this.withRetry(
      () => this.client.upsert(this.collectionName, { wait: true, points }),
      'Upserting documents'
    );

    console.log(`✅ Indexed ${points.length} documents`);
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    await this.initialize();
    const { query, k = CONFIG.SEARCH.DEFAULT_LIMIT, filter } = options;
    
    if (!query && filter) {
      const result = await this.client.scroll(this.collectionName, {
        filter: { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) },
        limit: k,
        with_payload: true,
        with_vector: false,
      });
      
      return result.points.map((res, i) => ({
        id: (res.payload?.originalId as string) || String(res.id ?? `result_${i}`),
        content: (res.payload?.text as string) || '',
        metadata: res.payload || {},
        score: 1,
        distance: 0,
      }));
    }

    if (!query) throw new Error('Query required for semantic search');

    const queryTokens = this.countTokens(query);
    this.updateStats(queryTokens);

    const { embedding: vector } = await this.withRetry(
      () => embed({ model: this.embeddingModel, value: query }),
      'Generating query embedding'
    );

    const searchParams: any = {
      vector,
      limit: k,
      with_payload: true,
      with_vector: false,
    };

    if (filter) {
      searchParams.filter = {
        must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } }))
      };
    }

    const results = await this.withRetry(
      () => this.client.search(this.collectionName, searchParams),
      'Performing search'
    );

    return results.map((res, i) => ({
      id: (res.payload?.originalId as string) || String(res.id ?? `result_${i}`),
      content: (res.payload?.text as string) || '',
      metadata: res.payload || {},
      score: typeof res.score === 'number' ? res.score : 0,
      distance: 1 - (typeof res.score === 'number' ? res.score : 0),
    }));
  }

  async searchBroad(query: string, limit: number): Promise<SearchResult[]> {
    const cappedLimit = Math.min(limit, CONFIG.SEARCH.MAX_BROAD_SEARCH_LIMIT);
    const queryTokens = this.countTokens(query);
    this.updateStats(queryTokens);
    
    const { embedding: vector } = await this.withRetry(
      () => embed({ model: this.embeddingModel, value: query }),
      'Generating query embedding'
    );

    const results = await this.withRetry(
      () => this.client.search(this.collectionName, {
        vector,
        limit: cappedLimit,
        with_payload: true,
        with_vector: false,
        score_threshold: CONFIG.SEARCH.MIN_SCORE_THRESHOLD,
      }),
      'Performing broad search'
    );

    return results.map((res, i) => ({
      id: (res.payload?.originalId as string) || String(res.id ?? `result_${i}`),
      content: (res.payload?.text as string) || '',
      metadata: res.payload || {},
      score: typeof res.score === 'number' ? res.score : 0,
      distance: 1 - (typeof res.score === 'number' ? res.score : 0),
    }));
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.initialize();
    
    const convertedIds = ids.map(id => uuidv5(id, SHAREPOINT_NAMESPACE));
    await this.withRetry(
      () => this.client.delete(this.collectionName, { points: convertedIds }),
      'Deleting documents'
    );
  }

  async updateDocument(id: string, content: string, metadata: Record<string, any>): Promise<void> {
    await this.initialize();
    
    const pointId = uuidv5(id, SHAREPOINT_NAMESPACE);
    const tokenCount = this.countTokens(content);
    this.updateStats(tokenCount);
    
    const { embedding } = await this.withRetry(
      () => embed({ model: this.embeddingModel, value: content }),
      'Generating embedding for update'
    );

    await this.withRetry(
      () => this.client.upsert(this.collectionName, {
        wait: true,
        points: [{ 
          id: pointId, 
          vector: embedding as number[], 
          payload: { ...metadata, text: content, originalId: id, tokenCount } 
        }],
      }),
      'Updating document'
    );
  }

  async getCollectionStats(): Promise<{ count: number; modelStats: ModelStats }> {
    await this.initialize();
    
    const countInfo = await this.withRetry(
      () => this.client.count(this.collectionName, { exact: true }),
      'Getting collection stats'
    );

    return { 
      count: countInfo.count || 0,
      modelStats: { ...this.stats },
    };
  }

  async clearCollection(): Promise<void> {
    await this.initialize();
    
    await this.withRetry(
      () => this.client.deleteCollection(this.collectionName),
      'Clearing collection'
    );
    
    this.isInitialized = false;
    this.stats.totalTokensProcessed = 0;
    this.stats.estimatedCost = 0;
    
    await this.initialize();
    console.log(`🧹 Collection cleared: ${this.collectionName}`);
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const [collections, stats] = await Promise.all([
        this.client.getCollections(),
        this.getCollectionStats(),
      ]);

      return {
        healthy: true,
        details: {
          collections: collections.collections?.length || 0,
          documentCount: stats.count,
          modelStats: stats.modelStats,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: String(error) },
      };
    }
  }
}