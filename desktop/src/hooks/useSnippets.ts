import { useState } from 'react';
import { ChromaClient } from '../lib/chroma-client';

/**
 * Hook to manage snippets for a specific URL
 */
export function useSnippets(chromaPath: string, apiKey: string) {
  const [snippets, setSnippets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  /**
   * Fetch snippets for a specific URL
   */
  const fetchSnippets = async (url: string) => {
    if (!chromaPath || !apiKey) {
      setError("ChromaDB path or API key not set");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSelectedUrl(url);
      
      // Create a new ChromaDB client
      const chromaClient = new ChromaClient(chromaPath, apiKey);
      await chromaClient.initialize();
      
      // Get snippets for the URL
      const urlSnippets = await chromaClient.getSnippetsForUrl(url);
      setSnippets(urlSnippets);
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