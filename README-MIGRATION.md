# Migration Guide: Removing Appwrite Dependency

## Overview
This application has been updated to remove the Appwrite storage dependency. Documents are now served directly from SharePoint through a custom document viewer, making them publicly accessible without requiring SharePoint permissions.

## Key Changes

### 1. Document Access Model
**Before:** Documents were downloaded from SharePoint and stored in Appwrite, with URLs pointing to Appwrite storage.

**After:** Documents remain in SharePoint and are accessed on-demand through a proxy endpoint that uses your Azure app credentials.

### 2. New Document Viewer
- **URL Pattern:** `/document/[documentId]`
- **Features:**
  - Fetches documents directly from SharePoint using your app's credentials
  - Renders PDFs, images, and text files inline
  - Provides download option for all document types
  - Shows document metadata (site, last modified, created by, etc.)

### 3. API Endpoints
New endpoints created:
- `GET /api/document/[id]/content` - Fetches document content from SharePoint
- `GET /api/document/[id]/metadata` - Retrieves document metadata from vector store

### 4. Updated Indexing Process
The indexing service now:
- No longer stores files in Appwrite
- Stores `documentViewerUrl` in vector metadata instead of Appwrite URLs
- Includes `driveId` in metadata for later document retrieval

### 5. Search Results
Search results now return:
- `documentViewerUrl` - Link to the public document viewer
- `webUrl` - Original SharePoint URL (kept for reference)

## Migration Steps

### For New Deployments
1. Set up your environment variables (see `.env.example`)
2. Ensure your Azure app has Sites.Selected and Files.Read.All permissions
3. Run the indexing process as normal

### For Existing Deployments

#### Option 1: Full Re-index (Recommended)
1. Clear your existing index:
   ```bash
   curl -X DELETE http://localhost:3000/api/index/sharepoint?action=clear
   ```
2. Re-index all documents with the new system
3. Documents will now have viewer URLs instead of Appwrite URLs

#### Option 2: Gradual Migration
1. Deploy the new code
2. New documents will be indexed with viewer URLs
3. Existing documents will still work but won't have the new viewer URLs
4. Re-index specific documents as needed

## Environment Variables

### Required
```env
# SharePoint Configuration
SHAREPOINT_CLIENT_ID=your_client_id
SHAREPOINT_CLIENT_SECRET=your_client_secret
SHAREPOINT_TENANT_ID=your_tenant_id

# Vector Database (Qdrant)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=sharepoint_documents

# OpenAI (for chat)
OPENAI_API_KEY=your_openai_api_key

# Application URL (for generating document viewer URLs)
NEXT_PUBLIC_APP_URL=https://your-app-domain.com
```

### No Longer Needed
```env
# These can be removed:
APPWRITE_ENDPOINT=
APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
APPWRITE_BUCKET_ID=
```

## Benefits of This Approach

1. **Reduced Dependencies:** No need to maintain Appwrite infrastructure
2. **Cost Savings:** No storage costs for document copies
3. **Always Current:** Documents are fetched directly from SharePoint, ensuring you always serve the latest version
4. **Public Access:** Documents are accessible to anyone with the link, removing SharePoint permission barriers
5. **Simplified Architecture:** Fewer moving parts and external services

## Security Considerations

1. **Document Access:** All indexed documents become publicly accessible through your app. Only index documents that should be public.
2. **Rate Limiting:** Consider implementing rate limiting on the document endpoints to prevent abuse
3. **Caching:** Consider adding caching headers or a CDN to reduce load on SharePoint
4. **Authentication:** If needed, you can add authentication to the document viewer routes

## Troubleshooting

### Document Not Found
If a document shows "not found":
1. Check that the document was indexed after the migration
2. Verify the document still exists in SharePoint
3. Check that the driveId is stored in the vector metadata

### Slow Document Loading
- Consider implementing caching at the application or CDN level
- Check your SharePoint API rate limits

### Missing Metadata
For documents indexed before migration:
- Re-index the specific document
- Or perform a full re-index for consistency
