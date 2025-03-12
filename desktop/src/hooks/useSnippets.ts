import { useState, useEffect } from 'react';
import { useVectorDB } from './useVectorDB';
import { UniversalDocument } from '../lib/vector-db/types';

/**
 * Hook to manage snippets for a specific URL
 */
export function useSnippets(sessionId: number) {
  const [snippets, setSnippets] = useState<UniversalDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  // Use the vectorDB hook with sessionId
  const { 
    vectorDB,
    loading: vectorDBLoading,
    error: vectorDBError,
    isInitialized,
    getDocumentsByFilters
  } = useVectorDB(sessionId);

  // Update error state when vectorDBError changes
  useEffect(() => {
    if (vectorDBError) {
      setError(vectorDBError.message);
    }
  }, [vectorDBError]);

  /**
   * Fetch snippets for a specific URL
   */
  const fetchSnippets = async (url: string) => {
    if (!sessionId) {
      setError("No session selected");
      return;
    }

    if (!isInitialized) {
      setError("Vector database not initialized");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSelectedUrl(url);
      
      // Clear any previous snippets to avoid memory accumulation
      setSnippets([]);
      
      // Get snippets for the URL (limited to 50 for memory conservation)
      const urlSnippets = await getDocumentsByFilters(
        { source_url: url },
        50
      );
      
      setSnippets(urlSnippets);
    } catch (err) {
      console.error('Error fetching snippets:', err);
      setError('Failed to fetch snippets from vector database');
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
    loading: loading || vectorDBLoading,
    error,
    selectedUrl,
    fetchSnippets,
    clearSnippets,
    isInitialized
  };
} 