import { ChromaClient, Collection } from 'chromadb';
import { embed, embedMany } from 'ai';
import { openai } from './ai';
import { IVectorStore, VectorDocument, SearchOptions, SearchResult } from './vector-store.types';

const embeddingModel = openai.textEmbeddingModel('text-embedding-3-small');

export class ChromaVectorStore implements IVectorStore {
  private client: ChromaClient;
  private collection!: Collection;
  private collectionName: string;

  constructor(collectionName: string = 'sharepoint_documents') {
    this.client = new ChromaClient({
      path: process.env.CHROMA_URL || 'http://localhost:8000',
    });
    this.collectionName = collectionName;
  }

  async initialize(): Promise<void> {
    const collections = await this.client.listCollections();
    const exists = collections.some(col => col.name === this.collectionName);
    if (!exists) {
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        metadata: { description: 'SharePoint document embeddings for RAG search' },
      });
    } else {
      this.collection = await this.client.getCollection({ name: this.collectionName });
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    const texts = documents.map(doc => doc.content);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: texts,
    });
    const ids = documents.map(doc => doc.id);
    const metadatas = documents.map(doc => doc.metadata);
    await this.collection.add({ ids, embeddings, metadatas, documents: texts });
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, k = 5, filter, includeMetadata = true } = options;
    const { embedding: queryEmbedding } = await embed({
      model: embeddingModel,
      value: query,
    });
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: k,
      where: filter,
      include: ['metadatas', 'documents', 'distances'],
    });

    if (!results.documents || !results.documents[0]) return [];

    const out: SearchResult[] = [];
    const documents = results.documents[0];
    const metadatas = results.metadatas?.[0] || [];
    const distances = results.distances?.[0] || [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      const metadata = metadatas[i] || {};
      const distance = distances[i] || 0;
      const score = Math.max(0, 1 - distance);
      out.push({
        id: String((metadata as any).id ?? `result_${i}`),
        content: String(document ?? ''),
        metadata: includeMetadata ? metadata : {},
        score,
        distance,
      });
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.collection.delete({ ids });
  }

  async updateDocument(id: string, content: string, metadata: Record<string, any>): Promise<void> {
    const { embedding } = await embed({
      model: embeddingModel,
      value: content,
    });
    await this.collection.update({ ids: [id], embeddings: [embedding], metadatas: [metadata], documents: [content] });
  }

  async getCollectionStats(): Promise<{ count: number }> {
    const count = await this.collection.count();
    return { count };
  }

  async clearCollection(): Promise<void> {
    await this.client.deleteCollection({ name: this.collectionName });
    await this.initialize();
  }
}

// Backwards-compatible default export for existing imports
export { ChromaVectorStore as VectorStore };

let vectorStoreInstance: IVectorStore | null = null;
export async function getVectorStore(): Promise<IVectorStore> {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new ChromaVectorStore();
    await (vectorStoreInstance as ChromaVectorStore).initialize();
  }
  return vectorStoreInstance;
}

