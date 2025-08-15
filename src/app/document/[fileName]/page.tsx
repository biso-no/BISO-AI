'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Lazy load specialized viewers
const ExcelViewer = lazy(() => import('@/app/components/ExcelViewer'));
const WordViewer = lazy(() => import('@/app/components/WordViewer'));

export default function DocumentViewerPage() {
  const params = useParams();
  const fileName = decodeURIComponent(params.fileName as string);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => {
    checkDocumentType();
  }, [fileName]);

  const checkDocumentType = async () => {
    try {
      setLoading(true);
      const encodedFileName = encodeURIComponent(fileName);
      const response = await fetch(`/api/document/${encodedFileName}/metadata`);
      
      if (!response.ok) {
        throw new Error('Document not found');
      }

      const data = await response.json();
      setContentType(data.metadata.contentType);
      setDocumentName(data.metadata.name);
      setDocumentId(data.metadata.id); // Store the actual documentId for API calls
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const isExcelFile = (type: string | null, name: string | null): boolean => {
    if (!type && !name) return false;
    const lowerType = type?.toLowerCase() || '';
    const lowerName = name?.toLowerCase() || '';
    
    return lowerType.includes('spreadsheet') || 
           lowerType.includes('excel') ||
           lowerType.includes('ms-excel') ||
           lowerType.includes('vnd.openxmlformats-officedocument.spreadsheetml') ||
           lowerName.endsWith('.xlsx') ||
           lowerName.endsWith('.xls') ||
           lowerName.endsWith('.xlsm') ||
           lowerName.endsWith('.xlsb');
  };

  const isWordFile = (type: string | null, name: string | null): boolean => {
    if (!type && !name) return false;
    const lowerType = type?.toLowerCase() || '';
    const lowerName = name?.toLowerCase() || '';
    
    return lowerType.includes('word') || 
           lowerType.includes('msword') ||
           lowerType.includes('vnd.openxmlformats-officedocument.wordprocessingml') ||
           lowerName.endsWith('.docx') ||
           lowerName.endsWith('.doc');
  };

  const isPowerPointFile = (type: string | null, name: string | null): boolean => {
    if (!type && !name) return false;
    const lowerType = type?.toLowerCase() || '';
    const lowerName = name?.toLowerCase() || '';
    
    return lowerType.includes('powerpoint') || 
           lowerType.includes('presentation') ||
           lowerType.includes('ms-powerpoint') ||
           lowerType.includes('vnd.openxmlformats-officedocument.presentationml') ||
           lowerName.endsWith('.pptx') ||
           lowerName.endsWith('.ppt');
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading document...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Render Excel files with ExcelViewer
  if (isExcelFile(contentType, documentName)) {
    return (
      <Suspense fallback={
        <div className="w-full h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-500">Loading spreadsheet viewer...</div>
        </div>
      }>
        <ExcelViewer fileName={fileName} />
      </Suspense>
    );
  }

  // Render Word files with WordViewer (future enhancement)
  if (isWordFile(contentType, documentName)) {
    return (
      <Suspense fallback={
        <div className="w-full h-screen flex items-center justify-center">
          <div className="text-gray-500">Loading document viewer...</div>
        </div>
      }>
        <WordViewer fileName={fileName} />
      </Suspense>
    );
  }

  // For PDFs and images, render them full screen
  if (contentType?.toLowerCase().includes('pdf') || 
      contentType?.toLowerCase().includes('image')) {
    return (
      <iframe
        src={`/api/document/${encodeURIComponent(fileName)}/content`}
        className="w-full h-screen border-0"
        title="Document Viewer"
      />
    );
  }

  // For PowerPoint and other types, show a download prompt with preview message
  if (isPowerPointFile(contentType, documentName)) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-orange-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 2h9l5 5v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1v5h5m-4 4v5h-4v-5h4z"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">{documentName}</h3>
          <p className="text-gray-600 mb-4">
            PowerPoint preview coming soon!
          </p>
          <a 
            href={`/api/document/${encodeURIComponent(fileName)}/content`}
            download
            className="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Download Presentation
          </a>
        </div>
      </div>
    );
  }

  // Default: For other types, show a simple download prompt
  return (
    <div className="w-full h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600 mb-4">
          This document type cannot be displayed directly
        </p>
        <a 
          href={`/api/document/${encodeURIComponent(fileName)}/content`}
          download
          className="text-blue-500 hover:underline"
        >
          Click here to download
        </a>
      </div>
    </div>
  );
}
