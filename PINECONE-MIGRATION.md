# Migration to Pinecone Vector Database

## Overview

This project has been migrated from self-hosted vector stores (Qdrant/Chroma) to **Pinecone**, which is Vercel's recommended vector database solution for production deployments.

## Why Pinecone?

1. **Vercel Recommended**: Native integration with Vercel's infrastructure
2. **Serverless Architecture**: No need to manage infrastructure
3. **Scalability**: Automatically scales with your application
4. **Performance**: Optimized for production workloads
5. **Cost-Effective**: Pay only for what you use

## Migration Changes

### 1. Dependencies Updated

**Removed:**
- `@qdrant/js-client-rest` - Self-hosted Qdrant client
- `chromadb` - Self-hosted Chroma client

**Added:**
- `@pinecone-database/pinecone` - Pinecone official SDK

### 2. New Files Created

- **`src/app/lib/vector-store-pinecone.ts`**: New Pinecone implementation
  - Supports text-embedding-3-small and text-embedding-3-large models
  - Includes retry logic and error handling
  - Optimized batching for better performance
  - Token counting and cost estimation

### 3. Files Updated

- **`src/app/lib/vector-store-factory.ts`**: Now uses Pinecone as the default vector store
- **`package.json`**: Updated dependencies

### 4. Files Removed

- **`docker-compose.yml`**: No longer needed for self-hosted services
- **`src/app/lib/vector-store-qdrant.ts`**: Can be safely deleted after migration
- **`src/app/lib/vector-store.ts`**: Chroma implementation can be removed

## Setup Instructions

### 1. Create Pinecone Account

1. Go to [Pinecone.io](https://www.pinecone.io/)
2. Sign up for a free account
3. Create a new project

### 2. Create an Index

In the Pinecone console:

1. Click "Create Index"
2. Configuration:
   - **Name**: `sharepoint-documents` (or your preferred name)
   - **Dimensions**: 
     - `1536` for text-embedding-3-small
     - `3072` for text-embedding-3-large (default)
   - **Metric**: `cosine`
   - **Cloud Provider**: AWS
   - **Region**: `us-east-1` (or your preferred region)
   - **Plan**: Starter (free) or higher

### 3. Configure Environment Variables

Create a `.env.local` file in your project root:

```env
# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=sharepoint-documents
PINECONE_REGION=us-east-1

# OpenAI Configuration (unchanged)
OPENAI_API_KEY=your-openai-api-key

# SharePoint Configuration (unchanged)
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_CLIENT_ID=your-client-id
SHAREPOINT_CLIENT_SECRET=your-client-secret
SHAREPOINT_SITE_ID=your-site-id
```

### 4. Deploy to Vercel

1. Push your changes to GitHub
2. In Vercel Dashboard:
   - Go to your project settings
   - Navigate to "Environment Variables"
   - Add the Pinecone variables:
     - `PINECONE_API_KEY`
     - `PINECONE_INDEX_NAME`
     - `PINECONE_REGION`
3. Redeploy your application

## Data Migration

If you have existing data in Qdrant/Chroma:

### Option 1: Re-index from SharePoint

Simply clear and re-index your documents:

```bash
# The application will automatically re-index documents
# when you access the indexing endpoints
```

### Option 2: Manual Migration (if needed)

If you need to preserve existing embeddings, you can write a migration script:

```typescript
// Example migration script (pseudo-code)
import { QdrantVectorStore } from './old-qdrant-store';
import { PineconeVectorStore } from './vector-store-pinecone';

async function migrate() {
  const oldStore = new QdrantVectorStore();
  const newStore = new PineconeVectorStore();
  
  // Extract documents from old store
  const documents = await oldStore.getAllDocuments();
  
  // Add to new store
  await newStore.addDocuments(documents);
}
```

## Features Comparison

| Feature | Qdrant (Old) | Pinecone (New) |
|---------|--------------|----------------|
| Hosting | Self-hosted | Serverless |
| Scaling | Manual | Automatic |
| Maintenance | Required | None |
| Backup | Manual | Automatic |
| High Availability | Complex setup | Built-in |
| Cost | Fixed (server costs) | Pay-per-use |
| Vercel Integration | None | Native |

## API Compatibility

The migration maintains full API compatibility. All existing code using the vector store interface continues to work without changes:

```typescript
// This code works with both old and new implementations
const vectorStore = await getVectorStore();
await vectorStore.addDocuments(documents);
const results = await vectorStore.search({ query: "search term" });
```

## Performance Optimizations

The new Pinecone implementation includes:

1. **Intelligent Batching**: Automatically batches embeddings and upserts for optimal performance
2. **Token Management**: Tracks token usage and estimates costs
3. **Retry Logic**: Automatic retry with exponential backoff
4. **Connection Pooling**: Efficient connection management
5. **Namespace Support**: Organize documents in separate namespaces

## Monitoring and Debugging

### Health Check Endpoint

The implementation includes a health check method:

```typescript
const health = await vectorStore.healthCheck();
console.log(health);
// Output: { healthy: true, details: {...} }
```

### Cost Tracking

Monitor embedding costs:

```typescript
const stats = await vectorStore.getCollectionStats();
console.log(stats.modelStats);
// Output: { totalTokensProcessed: 12345, estimatedCost: 0.25 }
```

## Troubleshooting

### Common Issues

1. **"PINECONE_API_KEY is required"**
   - Ensure the environment variable is set
   - Check for typos in the variable name

2. **"Index not found"**
   - Verify the index name in Pinecone console
   - Check `PINECONE_INDEX_NAME` environment variable

3. **Dimension mismatch errors**
   - Ensure index dimensions match the embedding model
   - text-embedding-3-small: 1536 dimensions
   - text-embedding-3-large: 3072 dimensions

4. **Rate limiting**
   - The implementation includes automatic retry logic
   - For high-volume operations, consider upgrading your Pinecone plan

## Support

- [Pinecone Documentation](https://docs.pinecone.io/)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Pinecone Support](https://support.pinecone.io/)

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Configure environment variables
3. ✅ Deploy to Vercel
4. ✅ Re-index your documents
5. ✅ Monitor performance and costs

## Cleanup

After confirming the migration works:

1. Delete `src/app/lib/vector-store-qdrant.ts`
2. Delete `src/app/lib/vector-store.ts` (if not used elsewhere)
3. Remove any Qdrant/Chroma related environment variables

---

**Migration completed successfully! 🎉**

The application now uses Pinecone for all vector storage operations, providing better scalability, reliability, and integration with Vercel's infrastructure.
