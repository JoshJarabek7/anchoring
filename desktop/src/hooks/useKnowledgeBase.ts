import { useState, useEffect } from 'react';
import { createProviderWithKey } from '../lib/vector-db';
import { ContextType } from '../lib/vector-db/provider';
import { DocumentationCategory, FullDocumentationSnippet, getSelectedSession } from '../lib/db';

// Interface for filters
export interface KnowledgeBaseFilters {
  category: DocumentationCategory | 'all';
  language?: string;
  language_version?: string;
  framework?: string;
  framework_version?: string;
  library?: string;
  library_version?: string;
}

interface ComponentOptions {
  languages: string[];
  frameworks: string[];
  libraries: string[];
}

/**
 * Hook to manage knowledge base search, filtering and available components
 */
export function useKnowledgeBase(apiKey: string) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<FullDocumentationSnippet[]>([]);
  const [filters, setFilters] = useState<KnowledgeBaseFilters>({
    category: 'all'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableComponents, setAvailableComponents] = useState<ComponentOptions>({
    languages: [],
    frameworks: [],
    libraries: []
  });
  const [snippets, setSnippets] = useState<FullDocumentationSnippet[]>([]);
  
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
  
  // Load available components for filters
  const loadAvailableComponents = async () => {
    if (!apiKey) return;
    
    try {
      setLoading(true);
      const provider = await getProvider();
      
      // Get all component types
      const languageResults = await provider.getDocumentsByFilters({ category: DocumentationCategory.LANGUAGE }, 100);
      const frameworkResults = await provider.getDocumentsByFilters({ category: DocumentationCategory.FRAMEWORK }, 100);
      const libraryResults = await provider.getDocumentsByFilters({ category: DocumentationCategory.LIBRARY }, 100);
      
      // Extract unique component names
      const languages = [...new Set(languageResults.map(doc => doc.language).filter(Boolean))];
      const frameworks = [...new Set(frameworkResults.map(doc => doc.framework).filter(Boolean))];
      const libraries = [...new Set(libraryResults.map(doc => doc.library).filter(Boolean))];
      
      setAvailableComponents({
        languages,
        frameworks,
        libraries
      });
    } catch (err) {
      console.error('Error loading components:', err);
      setError('Failed to load available components');
    } finally {
      setLoading(false);
    }
  };
  
  // Search for snippets
  const searchSnippets = async (query: string, searchFilters?: KnowledgeBaseFilters) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    
    if (!apiKey) {
      setError('API key not set');
      return;
    }
    
    try {
      // Clear previous results to free memory
      setSearchResults([]);
      setLoading(true);
      setError(null);
      setSearchQuery(query);
      
      const provider = await getProvider();
      
      // Prepare filters for the search
      const filtersToUse = searchFilters || filters;
      const searchFiltersObj: any = {};
      
      // Only add non-'all' categories to the filter
      if (filtersToUse.category !== 'all') {
        searchFiltersObj.category = filtersToUse.category;
      }
      
      // Add other filters if they exist
      if (filtersToUse.language) searchFiltersObj.language = filtersToUse.language;
      if (filtersToUse.language_version) searchFiltersObj.language_version = filtersToUse.language_version;
      if (filtersToUse.framework) searchFiltersObj.framework = filtersToUse.framework;
      if (filtersToUse.framework_version) searchFiltersObj.framework_version = filtersToUse.framework_version;
      if (filtersToUse.library) searchFiltersObj.library = filtersToUse.library;
      if (filtersToUse.library_version) searchFiltersObj.library_version = filtersToUse.library_version;
      
      // Search with the query and filters - limit to 10 results for memory savings
      const results = await provider.searchDocuments(query, searchFiltersObj, 10);
      setSearchResults(results);
    } catch (err) {
      console.error('Error searching snippets:', err);
      setError('Failed to search documentation snippets');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Update filters
  const updateFilters = (newFilters: Partial<KnowledgeBaseFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  };
  
  // Clear search results
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };
  
  // Load components on initial render
  useEffect(() => {
    if (apiKey) {
      loadAvailableComponents();
    }
  }, [apiKey]);

  useEffect(() => {
    async function loadKnowledgeBase() {
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
        console.error('Error loading knowledge base:', err);
        setError(err instanceof Error ? err.message : 'Failed to load knowledge base');
      } finally {
        setLoading(false);
      }
    }

    loadKnowledgeBase();
  }, [apiKey]);
  
  return {
    searchQuery,
    searchResults,
    filters,
    loading,
    error,
    availableComponents,
    searchSnippets,
    updateFilters,
    clearSearch,
    loadAvailableComponents,
    snippets
  };
} 