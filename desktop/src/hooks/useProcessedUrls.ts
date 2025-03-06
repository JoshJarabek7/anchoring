import { useState, useEffect } from 'react';
import { getURLs, updateURLStatus } from '../lib/db';
import { ChromaClient } from '../lib/chroma-client';

interface UrlSnippetCount {
  url: string;
  count: number | null;
}

/**
 * Hook to manage processed URLs for a session
 */
export function useProcessedUrls(sessionId: number, chromaPath?: string, apiKey?: string) {
  const [processedUrls, setProcessedUrls] = useState<string[]>([]);
  const [urlSnippetCounts, setUrlSnippetCounts] = useState<UrlSnippetCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [countLoading, setCountLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load processed URLs from the database
  const loadProcessedUrls = async () => {
    if (!sessionId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get all URLs for the session
      const allUrls = await getURLs(sessionId);
      
      // Filter to only get processed URLs
      const processed = allUrls
        .filter(url => url.status === 'processed')
        .map(url => url.url);
      
      setProcessedUrls(processed);
      
      // Initialize snippet counts as null (unknown)
      const initialCounts = processed.map(url => ({ url, count: null }));
      setUrlSnippetCounts(initialCounts);
      
      // If we have ChromaDB path and API key, load snippet counts
      if (chromaPath && apiKey && processed.length > 0) {
        loadSnippetCounts(processed, chromaPath, apiKey);
      }
    } catch (err) {
      console.error('Error loading processed URLs:', err);
      setError('Failed to load processed URLs');
    } finally {
      setLoading(false);
    }
  };
  
  // Load snippet counts for URLs
  const loadSnippetCounts = async (urls: string[], chromaPath: string, apiKey: string) => {
    if (!urls.length) return;
    
    try {
      setCountLoading(true);
      
      // Create ChromaDB client
      const chromaClient = new ChromaClient(chromaPath, apiKey);
      await chromaClient.initialize();
      
      // Get counts for each URL
      const counts: UrlSnippetCount[] = [];
      
      for (const url of urls) {
        try {
          const snippets = await chromaClient.getSnippetsForUrl(url);
          counts.push({
            url,
            count: snippets.length
          });
        } catch (err) {
          console.error(`Error getting snippet count for ${url}:`, err);
          counts.push({
            url,
            count: null
          });
        }
      }
      
      setUrlSnippetCounts(counts);
    } catch (err) {
      console.error('Error loading snippet counts:', err);
    } finally {
      setCountLoading(false);
    }
  };

  // Mark URLs as processed in the database
  const markUrlsAsProcessed = async (urls: string[]) => {
    if (!sessionId || !urls.length) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get all URLs for the session to find their IDs
      const allUrls = await getURLs(sessionId);
      
      // Find matching URLs and update their status
      const urlsToUpdate = allUrls.filter(url => urls.includes(url.url));
      
      // Update each URL status
      for (const url of urlsToUpdate) {
        if (url.id) {
          await updateURLStatus(url.id, 'processed');
        }
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
      if (chromaPath && apiKey) {
        loadSnippetCounts(urls, chromaPath, apiKey);
      }
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
    if (sessionId) {
      loadProcessedUrls();
    }
  }, [sessionId]);

  return {
    processedUrls,
    getSnippetCount,
    loading: loading || countLoading,
    error,
    loadProcessedUrls,
    markUrlsAsProcessed,
  };
} 