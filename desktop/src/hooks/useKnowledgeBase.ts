import { useState, useEffect } from 'react';
import { ChromaClient } from '../lib/chroma-client';
import { DocumentationCategory, FullDocumentationSnippet } from '../lib/db';

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
  
  // Initialize ChromaClient
  const getClient = async () => {
    const client = new ChromaClient(apiKey);
    await client.initialize();
    return client;
  };
  
  // Load available components for filters
  const loadAvailableComponents = async () => {
    if (!apiKey) return;
    
    try {
      setLoading(true);
      const client = await getClient();
      
      // Get all component types
      const languages = await client.getAvailableComponents(DocumentationCategory.LANGUAGE);
      const frameworks = await client.getAvailableComponents(DocumentationCategory.FRAMEWORK);
      const libraries = await client.getAvailableComponents(DocumentationCategory.LIBRARY);
      
      // Release client to free memory
      (client as any).client = null;
      (client as any).collection = null;
      
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
      
      const client = await getClient();
      
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
      const results = await client.searchDocuments(query, searchFiltersObj, 10);
      setSearchResults(results);
      
      // Release client resources
      (client as any).client = null;
      (client as any).collection = null;
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
    loadAvailableComponents
  };
} 