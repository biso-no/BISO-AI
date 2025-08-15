'use client';

import { useState, useEffect } from 'react';

interface WordViewerProps {
  fileName: string;
}

export default function WordViewer({ fileName }: WordViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // For now, Word documents will be rendered as PDFs or require download
    // In future, we could use mammoth.js to extract HTML from Word docs
    setLoading(false);
  }, [fileName]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-gray-500">Loading document...</div>
      </div>
    );
  }

  // For now, show the document in an iframe (if the API can convert to PDF)
  // Or provide a download option
  return (
    <div className="w-full h-screen bg-white">
      <iframe
        src={`/api/document/${encodeURIComponent(fileName)}/content`}
        className="w-full h-full border-0"
        title="Document Viewer"
      />
    </div>
  );
}
