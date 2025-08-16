'use client';

import { useState, useEffect } from 'react';

interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

interface IndexingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  siteId: string;
  siteName: string;
  folderPath: string;
  recursive: boolean;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  startTime: string;
  endTime?: string;
  error?: string;
}

interface DocumentStats {
  totalDocuments: number;
  totalChunks: number;
}

export default function AdminPage() {
  const [sites, setSites] = useState<SharePointSite[]>([]);
  const [jobs, setJobs] = useState<IndexingJob[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState('');
  const [folderPath, setFolderPath] = useState('/');
  const [recursive, setRecursive] = useState(false);
  const [batchSize, setBatchSize] = useState(10);

  const [siteIdQuery, setSiteIdQuery] = useState('');
  const [siteQueryResult, setSiteQueryResult] = useState<any | null>(null);
  const [siteQueryError, setSiteQueryError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchSites();
    fetchJobs();
    fetchStats();
  }, []);

  const fetchSites = async () => {
    try {
      const response = await fetch('/api/index/sharepoint?action=sites');
      const data = await response.json();
      if (data.success) {
        setSites(data.sites);
      }
    } catch (error) {
      console.error('Error fetching sites:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/index/sharepoint?action=list');
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/index/sharepoint?action=stats');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const startIndexing = async () => {
    if (!selectedSite) {
      alert('Please select a SharePoint site');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/index/sharepoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: selectedSite,
          folderPath,
          recursive,
          batchSize,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Indexing job started successfully! Job ID: ${data.jobId}`);
        // Refresh jobs list
        setTimeout(() => {
          fetchJobs();
        }, 1000);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error starting indexing:', error);
      alert('Failed to start indexing job');
    } finally {
      setLoading(false);
    }
  };

  const clearIndex = async () => {
    if (!confirm('Are you sure you want to clear the entire index? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/index/sharepoint?action=clear', {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        alert('Index cleared successfully');
        fetchStats();
        fetchJobs();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error clearing index:', error);
      alert('Failed to clear index');
    }
  };

  const refreshData = () => {
    fetchJobs();
    fetchStats();
  };

  const querySiteById = async () => {
    setSiteQueryError(null);
    setSiteQueryResult(null);
    const id = siteIdQuery.trim();
    if (!id) return;
    try {
      const res = await fetch(`/api/index/sharepoint?action=site&siteId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        setSiteQueryResult(data.site);
      } else {
        setSiteQueryError(data.error || 'Unknown error');
      }
    } catch (e: any) {
      setSiteQueryError(e?.message || 'Request failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">SharePoint Indexing Admin</h1>
          <p className="mt-2 text-gray-600">
            Manage SharePoint document indexing and view system statistics
          </p>
        </div>

        {/* Statistics */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">System Statistics</h2>
          {stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.totalDocuments}</div>
                <div className="text-sm text-blue-500">Total Documents</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.totalChunks}</div>
                <div className="text-sm text-green-500">Total Chunks</div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading statistics...</div>
          )}
          <button
            onClick={refreshData}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Refresh Data
          </button>
        </div>

        {/* Start Indexing */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Start New Indexing Job</h2>
          {/* Site ID quick query */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Query Site by ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={siteIdQuery}
                onChange={(e) => setSiteIdQuery(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter site ID (e.g. contoso.sharepoint.com,siteCollectionId,siteId)"
              />
              <button
                onClick={querySiteById}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                GET
              </button>
            </div>
            {(siteQueryError || siteQueryResult) && (
              <div className="mt-3">
                {siteQueryError && (
                  <div className="text-red-600 text-sm">{siteQueryError}</div>
                )}
                {siteQueryResult && (
                  <pre className="mt-2 max-h-80 overflow-auto bg-gray-50 border border-gray-200 rounded p-3 text-xs">
{JSON.stringify(siteQueryResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SharePoint Site
              </label>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select a site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.displayName} ({site.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Folder Path
              </label>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="/"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="recursive"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="recursive" className="text-sm text-gray-700">
                Recursive (include subfolders)
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Batch Size
              </label>
              <input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                min="1"
                max="100"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>

          </div>
          <button
            onClick={startIndexing}
            disabled={loading || !selectedSite}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting...' : 'Start Indexing'}
          </button>
        </div>

        {/* Indexing Jobs */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Indexing Jobs</h2>
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Site
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          job.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : job.status === 'processing'
                            ? 'bg-blue-100 text-blue-800'
                            : job.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {job.siteName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {job.processedDocuments} / {job.totalDocuments}
                      {job.failedDocuments > 0 && (
                        <span className="text-red-600 ml-2">
                          ({job.failedDocuments} failed)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(job.startTime).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.error && (
                        <div className="text-red-600 text-xs max-w-xs truncate" title={job.error}>
                          {job.error}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobs.length === 0 && (
              <div className="text-center py-8 text-gray-500">No indexing jobs found</div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-800 mb-4">Danger Zone</h2>
          <p className="text-red-700 mb-4">
            These actions are irreversible and will delete all indexed data.
          </p>
          <button
            onClick={clearIndex}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Clear Entire Index
          </button>
        </div>
      </div>
    </div>
  );
}
