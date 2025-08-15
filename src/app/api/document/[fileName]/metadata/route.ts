import { NextRequest, NextResponse } from 'next/server';
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
    
    // Get vector store to search for document metadata
    const vectorStore = await getVectorStore();
    
    // Search for document chunks by fileName to get metadata
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

    // Extract metadata from the first result
    const metadata = results[0].metadata;
    
    // Return structured metadata
    return NextResponse.json(
      {
        success: true,
        metadata: {
          id: metadata.documentId,
          name: metadata.documentName || 'Unknown',
          siteId: metadata.siteId,
          siteName: metadata.siteName || 'Unknown Site',
          driveId: metadata.driveId,
          contentType: metadata.contentType || 'application/octet-stream',
          size: metadata.fileSize || 0,
          lastModified: metadata.lastModified || new Date().toISOString(),
          createdBy: metadata.createdBy || 'Unknown',
          webUrl: metadata.webUrl,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching document metadata:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch document metadata' 
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
