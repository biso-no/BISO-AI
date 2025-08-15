# BisoAI - SharePoint Document Indexing & RAG System

A Next.js application that serves as a proxy server between clients and OpenAI, with advanced SharePoint document indexing and RAG (Retrieval-Augmented Generation) capabilities.

## Features

- **OpenAI Proxy Server**: Enables tool calling and data querying from indexed sources
- **SharePoint Integration**: Index documents from multiple SharePoint Online sites
- **Document Processing**: Support for PDF, Word, HTML, and text files
- **Vector Database**: ChromaDB integration for semantic search
- **File Storage**: Appwrite storage for public document access
- **RAG Search**: AI-powered document search with source citations
- **Admin Interface**: Web-based management of indexing jobs

## Architecture

```
Client → Next.js API → OpenAI API
                ↓
        SharePoint Indexing Service
                ↓
        Document Processor + Vector Store
                ↓
        Appwrite Storage (public files)
```

## Prerequisites

- Node.js 18+ and npm/bun
- SharePoint Online tenant with API access
- Appwrite instance
- Vector DB: ChromaDB or Qdrant (recommended)
- OpenAI API key

## Environment Variables

Create a `.env.local` file with the following variables:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# SharePoint Configuration
SHAREPOINT_CLIENT_ID=your_sharepoint_client_id_here
SHAREPOINT_CLIENT_SECRET=your_sharepoint_client_secret_here
SHAREPOINT_TENANT_ID=your_sharepoint_tenant_id_here

# Appwrite Configuration
APPWRITE_ENDPOINT=https://your-appwrite-instance.com/v1
APPWRITE_PROJECT_ID=your_appwrite_project_id_here
APPWRITE_BUCKET_ID=your_appwrite_bucket_id_here

# Vector Store
# Use one of the following backends:
# 1) Chroma (default)
# CHROMA_URL=http://localhost:8000
# 2) Qdrant (recommended)
VECTOR_BACKEND=qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
# or
bun install
```

### 2. SharePoint App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Azure Active Directory → App registrations
3. Create a new registration
4. Add API permissions for Microsoft Graph (Sites.Read.All, Files.Read.All)
5. Create a client secret
6. Note down the Client ID, Client Secret, and Tenant ID

### 3. Appwrite Setup

1. Create a new Appwrite project
2. Create a storage bucket for documents
3. Configure bucket permissions for public read access
4. Note down the endpoint, project ID, and bucket ID

### 4. Vector DB Setup

Option A) Qdrant (recommended)

```bash
docker compose up -d qdrant
```

Option B) ChromaDB

```bash
docker run -p 8000:8000 chromadb/chroma:latest
```

### 5. Run the Application

```bash
npm run dev
# or
bun dev
```

## Usage

### Admin Interface

Visit `/admin` to access the SharePoint indexing management interface:

- View system statistics
- Start new indexing jobs
- Monitor job progress
- Manage indexed documents

### API Endpoints

#### Start Indexing
```bash
POST /api/index/sharepoint
{
  "siteId": "site_id_here",
  "folderPath": "/",
  "recursive": true,
  "batchSize": 10,
  "storeFiles": true
}
```

#### Get Job Status
```bash
GET /api/index/sharepoint?jobId=job_id_here
```

#### List All Jobs
```bash
GET /api/index/sharepoint?action=list
```

#### Get Statistics
```bash
GET /api/index/sharepoint?action=stats
```

#### List SharePoint Sites
```bash
GET /api/index/sharepoint?action=sites
```

### Chat Integration

The system integrates with your existing chat functionality through AI tools:

- `searchSharePoint`: Search indexed documents
- `getDocumentStats`: Get system statistics
- `listSharePointSites`: List available sites

## Document Processing

The system supports the following file types:

- **PDF**: Text extraction using pdf-parse
- **Word**: Text extraction using mammoth
- **HTML**: Text extraction using turndown
- **Text**: Direct text processing

Documents are automatically chunked into searchable segments with configurable overlap.

## File Storage

Documents are stored in Appwrite storage with:

- Public read access for easy sharing
- Metadata preservation
- Original file format maintenance
- SharePoint source tracking

## Vector Search

Documents are indexed using:

- OpenAI text-embedding-3-small embeddings
- ChromaDB vector database
- Semantic similarity search
- Metadata filtering capabilities

## Security Considerations

- SharePoint credentials are stored as environment variables
- Appwrite storage bucket configured for public read access
- API endpoints include CORS headers for cross-origin requests
- Document access controlled through Appwrite permissions

## Troubleshooting

### Common Issues

1. **SharePoint Authentication Errors**
   - Verify client ID, secret, and tenant ID
   - Check API permissions in Azure AD
   - Ensure app has proper consent

2. **ChromaDB Connection Issues**
   - Verify ChromaDB is running on the correct port
   - Check network connectivity
   - Verify collection creation permissions

3. **Appwrite Storage Errors**
   - Verify bucket ID and project ID
   - Check bucket permissions
   - Ensure proper API key configuration

### Logs

Check the console output for detailed error messages and processing logs.

## Development

### Project Structure

```
src/
├── app/
│   ├── admin/           # Admin interface
│   ├── api/
│   │   ├── chat/        # Chat API with RAG tools
│   │   └── index/       # SharePoint indexing API
│   └── lib/
│       ├── sharepoint.ts        # SharePoint service
│       ├── document-processor.ts # Document processing
│       ├── vector-store.ts      # ChromaDB integration
│       ├── appwrite-storage.ts  # Appwrite storage
│       └── indexing-service.ts  # Main indexing orchestration
```

### Adding New Document Types

1. Extend the `DocumentProcessor` class
2. Add new extraction methods
3. Update the `processDocument` method
4. Test with sample files

### Customizing Search

1. Modify the `VectorStore` class
2. Adjust embedding models
3. Customize similarity metrics
4. Add new filtering options

## License

[Your License Here]

## Contributing

[Your Contributing Guidelines Here]
