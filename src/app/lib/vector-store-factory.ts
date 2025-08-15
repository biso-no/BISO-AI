import { IVectorStore } from './vector-store.types';
import { ChromaVectorStore } from './vector-store';
import { QdrantVectorStore } from './vector-store-qdrant';

let instance: IVectorStore | null = null;

export async function getVectorStore(): Promise<IVectorStore> {
	if (instance) return instance;

	const backend = (process.env.VECTOR_BACKEND || 'chroma').toLowerCase();

	if (backend === 'qdrant') {
		instance = new QdrantVectorStore();
	} else {
		instance = new ChromaVectorStore();
	}

	await instance.initialize();
	return instance;
}
