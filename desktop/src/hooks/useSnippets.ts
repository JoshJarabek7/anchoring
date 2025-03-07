import { useState } from 'react';
import { ChromaClient } from '../lib/chroma-client';

/**
 * Hook to manage snippets for a specific URL
 */
export function useSnippets(apiKey: string) {
  const [snippets, setSnippets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  /**
   * Fetch snippets for a specific URL
   */
  const fetchSnippets = async (url: string) => {
    if (!apiKey) {
      setError("API key not set");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSelectedUrl(url);
      
      // Clear any previous snippets to avoid memory accumulation
      setSnippets([]);
      
      // Create a new ChromaDB client
      const chromaClient = new ChromaClient(apiKey);
      await chromaClient.initialize();
      
      // Get snippets for the URL (limited to 50 for memory conservation)
      const urlSnippets = await chromaClient.getSnippetsForUrl(url, 50);
      
      // Use functional state update to avoid stale closure issues
      setSnippets(urlSnippets);
      
      // Release the chromaClient to free up memory
      (chromaClient as any).client = null;
      (chromaClient as any).collection = null;
    } catch (err) {
      console.error('Error fetching snippets:', err);
      setError('Failed to fetch snippets from ChromaDB');
      setSnippets([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear the selected snippets
   */
  const clearSnippets = () => {
    setSnippets([]);
    setSelectedUrl(null);
  };

  return {
    snippets,
    loading,
    error,
    selectedUrl,
    fetchSnippets,
    clearSnippets
  };
} 