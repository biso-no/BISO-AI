import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createIndexingService } from '@/app/lib/indexing-service';
import { SharePointService, getSharePointConfig } from '@/app/lib/sharepoint';

// Request schemas
const StartIndexingSchema = z.object({
  siteId: z.string(),
  folderPath: z.string().optional().default('/'),
  recursive: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(100).optional().default(10),
  maxConcurrency: z.number().int().min(1).max(10).optional().default(3),
});

const ReindexDocumentSchema = z.object({
  documentId: z.string(),
  siteId: z.string(),
  driveId: z.string(),
});

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Start indexing job
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = StartIndexingSchema.parse(body);

    const indexingService = await createIndexingService();
    const jobId = await indexingService.startIndexing(validatedData);

    return NextResponse.json(
      { 
        success: true, 
        jobId,
        message: 'Indexing job started successfully' 
      },
      { 
        status: 202,
        headers: corsHeaders,
      }
    );

  } catch (error) {
    console.error('Error starting indexing job:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request data', 
          details: error.issues 
        },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

// Get job status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');
    const action = searchParams.get('action');

    const indexingService = await createIndexingService();

    if (action === 'list') {
      // List all jobs
      const jobs = await indexingService.listJobs();
      return NextResponse.json(
        { 
          success: true, 
          jobs: jobs.map(job => ({
            ...job,
            startTime: job.startTime.toISOString(),
            endTime: job.endTime?.toISOString(),
          }))
        },
        { headers: corsHeaders }
      );
    }

    if (action === 'stats') {
      // Get document statistics
      const stats = await indexingService.getDocumentStats();
      return NextResponse.json(
        { 
          success: true, 
          stats 
        },
        { headers: corsHeaders }
      );
    }

    if (action === 'sites') {
      // List SharePoint sites
      const sharePointService = new SharePointService(getSharePointConfig());
      const sites = await sharePointService.listSites();
      return NextResponse.json(
        { 
          success: true, 
          sites 
        },
        { headers: corsHeaders }
      );
    }

    if (action === 'documents' && searchParams.get('siteId')) {
      // List documents from a specific site
      const siteId = searchParams.get('siteId')!;
      const folderPath = searchParams.get('folderPath') || '/';
      const recursive = searchParams.get('recursive') === 'true';
      
      const sharePointService = new SharePointService(getSharePointConfig());
      const documents = await sharePointService.listDocuments(siteId, folderPath, recursive);
      
      return NextResponse.json(
        { 
          success: true, 
          documents 
        },
        { headers: corsHeaders }
      );
    }

    if (action === 'site' && searchParams.get('siteId')) {
      const siteId = searchParams.get('siteId')!;
      const sharePointService = new SharePointService(getSharePointConfig());
      try {
        const details = await sharePointService.getSiteDetailsRaw(siteId);
        return NextResponse.json(
          {
            success: true,
            site: details,
          },
          { headers: corsHeaders },
        );
      } catch (err: any) {
        return NextResponse.json(
          {
            success: false,
            error: err?.message ?? 'Failed to fetch site',
          },
          { status: 400, headers: corsHeaders },
        );
      }
    }

    if (jobId) {
      // Get specific job status
      const job = await indexingService.getJobStatus(jobId);
      if (!job) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Job not found' 
          },
          { 
            status: 404,
            headers: corsHeaders,
          }
        );
      }

      return NextResponse.json(
        { 
          success: true, 
          job: {
            ...job,
            startTime: job.startTime.toISOString(),
            endTime: job.endTime?.toISOString(),
          }
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid action or missing parameters' 
      },
      { 
        status: 400,
        headers: corsHeaders,
      }
    );

  } catch (error) {
    console.error('Error in GET request:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

// Update operations (PUT)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'reindex') {
      const validatedData = ReindexDocumentSchema.parse(body);
      const indexingService = await createIndexingService();
      
      await indexingService.reindexDocument(
        validatedData.documentId,
        validatedData.siteId,
        validatedData.driveId
      );

      return NextResponse.json(
        { 
          success: true, 
          message: 'Document reindexed successfully' 
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid action' 
      },
      { 
        status: 400,
        headers: corsHeaders,
      }
    );

  } catch (error) {
    console.error('Error in PUT request:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request data', 
          details: error.issues 
        },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

// Delete operations
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    const indexingService = await createIndexingService();

    if (action === 'clear') {
      // Clear entire index
      await indexingService.clearIndex();
      return NextResponse.json(
        { 
          success: true, 
          message: 'Index cleared successfully' 
        },
        { headers: corsHeaders }
      );
    }

    if (action === 'job' && searchParams.get('jobId')) {
      // Cancel/delete specific job (implementation depends on your needs)
      const jobId = searchParams.get('jobId')!;
      // Note: You might want to implement job cancellation logic
      return NextResponse.json(
        { 
          success: true, 
          message: 'Job deletion not implemented yet' 
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid action' 
      },
      { 
        status: 400,
        headers: corsHeaders,
      }
    );

  } catch (error) {
    console.error('Error in DELETE request:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}


