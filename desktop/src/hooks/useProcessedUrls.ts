import { useState, useEffect } from 'react';
import { useVectorDB } from './useVectorDB';

interface UrlSnippetCount {
  url: string;
  count: number | null;
}

/**
 * Hook to manage processed URLs for a session
 */
export function useProcessedUrls(sessionId: number) {
  const [processedUrls, setProcessedUrls] = useState<string[]>([]);
  const [urlSnippetCounts, setUrlSnippetCounts] = useState<UrlSnippetCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [countLoading, setCountLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the vectorDB hook with sessionId
  const { 
    vectorDB,
    loading: vectorDBLoading,
    error: vectorDBError,
    getDocumentsByFilters,
    getSnippetCountForUrl,
    updateURLStatus
  } = useVectorDB(sessionId);

  // Update error state when vectorDBError changes
  useEffect(() => {
    if (vectorDBError) {
      setError(vectorDBError.message);
    }
  }, [vectorDBError]);

  // Load processed URLs from the database
  const loadProcessedUrls = async () => {
    if (!sessionId || !vectorDB) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get all URLs for the session
      const results = await getDocumentsByFilters({});
      
      // Filter to only get processed URLs
      const processed = results
        .map(doc => doc.source_url)
        .filter(Boolean)
        .filter(url => url.status === 'processed');
      
      setProcessedUrls(processed);
      
      // Initialize snippet counts as null (unknown)
      const initialCounts = processed.map(url => ({ url, count: null }));
      setUrlSnippetCounts(initialCounts);
      
      // Load snippet counts
      if (processed.length > 0) {
        loadSnippetCounts(processed);
      }
    } catch (err) {
      console.error('Error loading processed URLs:', err);
      setError('Failed to load processed URLs');
    } finally {
      setLoading(false);
    }
  };
  
  // Load snippet counts for URLs (optimized to avoid loading content)
  const loadSnippetCounts = async (urls: string[]) => {
    if (!urls.length || !vectorDB) return;
    
    try {
      setCountLoading(true);
      
      // Get counts for each URL - process in batches to avoid memory issues
      const BATCH_SIZE = 5;
      let counts: UrlSnippetCount[] = [];
      
      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batchUrls = urls.slice(i, i + BATCH_SIZE);
        const batchCounts: UrlSnippetCount[] = [];
        
        for (const url of batchUrls) {
          try {
            // Use the hook's method that handles the optional nature of the function
            const count = await getSnippetCountForUrl(url);
            batchCounts.push({
              url,
              count: count
            });
          } catch (err) {
            console.error(`Error getting snippet count for ${url}:`, err);
            batchCounts.push({
              url,
              count: null
            });
          }
        }
        
        // Update state with each batch to show progress
        counts = [...counts, ...batchCounts];
        setUrlSnippetCounts(prev => {
          const updatedCounts = [...prev];
          // Update counts for batch URLs
          for (const item of batchCounts) {
            const existingIndex = updatedCounts.findIndex(u => u.url === item.url);
            if (existingIndex >= 0) {
              updatedCounts[existingIndex] = item;
            } else {
              updatedCounts.push(item);
            }
          }
          return updatedCounts;
        });
      }
    } catch (err) {
      console.error('Error loading snippet counts:', err);
    } finally {
      setCountLoading(false);
    }
  };

  // Mark URLs as processed in the database
  const markUrlsAsProcessed = async (urls: string[]) => {
    if (!sessionId || !urls.length || !vectorDB) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get all URLs for the session to find their IDs
      const results = await getDocumentsByFilters({});
      
      // Find matching URLs and update their status
      const urlsToUpdate = results
        .filter(doc => urls.includes(doc.source_url))
        .map(doc => doc.source_url);
      
      // Update each URL status
      for (const url of urlsToUpdate) {
        await updateURLStatus(url, 'processed');
      }
      
      // Add the new processed URLs to our state
      setProcessedUrls(prev => {
        const newProcessed = [...prev];
        
        // Add any URLs that aren't already in the list
        for (const url of urls) {
          if (!newProcessed.includes(url)) {
            newProcessed.push(url);
          }
        }
        
        return newProcessed;
      });
      
      // Update the snippet counts
      loadSnippetCounts(urls);
    } catch (err) {
      console.error('Error marking URLs as processed:', err);
      setError('Failed to update URL status');
    } finally {
      setLoading(false);
    }
  };
  
  // Get snippet count for a URL
  const getSnippetCount = (url: string): number | null => {
    const entry = urlSnippetCounts.find(item => item.url === url);
    return entry ? entry.count : null;
  };

  // Initial load of processed URLs
  useEffect(() => {
    if (sessionId && vectorDB) {
      loadProcessedUrls();
    }
  }, [sessionId, vectorDB]);

  return {
    processedUrls,
    getSnippetCount,
    loading: loading || countLoading || vectorDBLoading,
    error,
    loadProcessedUrls,
    markUrlsAsProcessed,
  };
} 