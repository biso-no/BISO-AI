import { NextRequest, NextResponse } from 'next/server';
import { SharePointService, getSharePointConfig } from '@/app/lib/sharepoint';
import { getVectorStore } from '@/app/lib/vector-store-factory';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(
  req: NextRequest,
  { 
    params 
  }: { 
    params: 
    Promise<{ fileName: string }>
  }
) {
  try {
    const { fileName } = await params;
    const decodedFileName = decodeURIComponent(fileName);
    
    // Get vector store to find document metadata
    const vectorStore = await getVectorStore();
    
    // Search for document chunks by fileName to get drive information
    const results = await vectorStore.search({
      query: '',
      filter: { fileName: decodedFileName },
      k: 1,
      includeMetadata: true,
    });

    if (!results || results.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const metadata = results[0].metadata;
    const driveId = metadata.driveId;
    
    if (!driveId) {
      // If driveId is not in metadata, we need to fetch it from SharePoint
      // This is a fallback for older indexed documents
      return NextResponse.json(
        { error: 'Document drive information not available' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Initialize SharePoint service
    const sharePointService = new SharePointService(getSharePointConfig());
    
    // Download document content from SharePoint using documentId
    const documentId = metadata.documentId;
    const content = await sharePointService.downloadDocument(driveId, documentId);
    
    // Convert ArrayBuffer to Buffer for response
    const buffer = Buffer.from(content);
    
    // Determine content type
    const contentType = metadata.contentType || 'application/octet-stream';
    
    // Return the document content with appropriate headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${metadata.documentName || 'document'}"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error fetching document content:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch document content' 
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
