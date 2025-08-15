export type LocalIndexOptions = {
	directoryPath: string;
};

// Deprecated: LlamaIndex removed. Use vector store and IndexingService instead.
export async function createLocalIndex(_options: LocalIndexOptions) {
	return { deprecated: true } as const;
}




