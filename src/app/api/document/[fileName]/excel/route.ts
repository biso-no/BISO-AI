import { NextRequest, NextResponse } from 'next/server';
import { SharePointService, getSharePointConfig } from '@/app/lib/sharepoint';
import { getVectorStore } from '@/app/lib/vector-store-factory';
import * as XLSX from 'xlsx';

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

interface ExcelData {
  sheets: {
    name: string;
    data: any[][];
    merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  }[];
  metadata: {
    sheetNames: string[];
    documentName: string;
  };
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
    
    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(content);
    
    // Parse Excel file
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellStyles: true,
      cellHTML: true,
      cellDates: true,
      cellFormula: true,
      sheetStubs: true
    });
    
    // Extract data from all sheets
    const sheets = workbook.SheetNames.map((sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName];
      
      // Get the range of the worksheet
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // Convert to 2D array with proper formatting
      const data: any[][] = [];
      
      for (let row = range.s.r; row <= range.e.r; row++) {
        const rowData: any[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          
          if (cell) {
            // Try to preserve formatting and formulas
            rowData.push({
              value: cell.v !== undefined ? cell.v : '',
              formula: cell.f || null,
              type: cell.t || 's',
              format: cell.z || null,
              style: cell.s || null,
              html: cell.h || null,
              raw: cell.w || cell.v?.toString() || ''
            });
          } else {
            rowData.push({ value: '', raw: '' });
          }
        }
        data.push(rowData);
      }
      
      // Get merged cells information
      const merges = worksheet['!merges'] || [];
      
      return {
        name: sheetName,
        data,
        merges,
        cols: worksheet['!cols'] || [],
        rows: worksheet['!rows'] || []
      };
    });
    
    const excelData: ExcelData = {
      sheets,
      metadata: {
        sheetNames: workbook.SheetNames,
        documentName: metadata.documentName || 'Excel Document'
      }
    };
    
    return NextResponse.json(
      { 
        success: true,
        data: excelData
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error parsing Excel document:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to parse Excel document' 
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
