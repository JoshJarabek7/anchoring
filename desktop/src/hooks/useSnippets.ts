import { useState, useEffect } from 'react';
import { FullDocumentationSnippet, getSelectedSession } from '../lib/db';
import { createProviderWithKey } from '../lib/vector-db';
import { ContextType } from '../lib/vector-db/provider';

/**
 * Hook to manage snippets for a specific URL
 */
export function useSnippets(apiKey: string) {
  const [snippets, setSnippets] = useState<FullDocumentationSnippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  // Initialize provider with session config
  const getProvider = async () => {
    const session = await getSelectedSession();
    if (!session) {
      throw new Error("No session selected. Please select a session first.");
    }
    
    const provider = await createProviderWithKey(apiKey, session.context_type || ContextType.LOCAL);
    await provider.initialize({
      type: session.context_type || ContextType.LOCAL,
      pineconeApiKey: session.pinecone_api_key,
      pineconeEnvironment: session.pinecone_environment,
      pineconeIndexName: session.pinecone_index
    });
    
    return provider;
  };

  useEffect(() => {
    async function loadSnippets() {
      if (!apiKey) {
        setError('API key is required');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const provider = await getProvider();
        const results = await provider.getDocumentsByFilters({}, 100); // Get first 100 snippets
        setSnippets(results);
      } catch (err) {
        console.error('Error loading snippets:', err);
        setError(err instanceof Error ? err.message : 'Failed to load snippets');
      } finally {
        setLoading(false);
      }
    }

    loadSnippets();
  }, [apiKey]);

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
      
      // Create provider with session config
      const provider = await getProvider();
      const results = await provider.getDocumentsByFilters({ url: url }, 50);
      
      // Use functional state update to avoid stale closure issues
      setSnippets(results);
    } catch (err) {
      console.error('Error fetching snippets:', err);
      setError('Failed to fetch snippets from VectorDB');
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