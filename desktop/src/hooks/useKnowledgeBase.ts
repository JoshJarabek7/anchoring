import { useState, useEffect, useRef } from 'react';
import { DocumentationCategory, FullDocumentationSnippet } from '../lib/db';
import { useVectorDB } from './useVectorDB';

/**
 * Interface for a documentation snippet
 */
export interface DocSnippet {
  id: string;
  title: string;
  content: string;
  source: string;
  category: "language" | "framework" | "library";
  name: string;
  version?: string;
}

/**
 * Interface for a search result
 */
export interface SearchResult {
  id: string;
  score: number;
  snippet: DocSnippet;
}

/**
 * Interface for documentation search parameters
 */
export interface DocSearchParams {
  query?: string;
  category?: "language" | "framework" | "library";
  componentName?: string;
  componentVersion?: string;
  apiKey?: string;
  limit?: number;  // Number of documents to return
  page?: number;   // Page number for pagination
}

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
export function useKnowledgeBase(sessionId: number) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<FullDocumentationSnippet[]>([]);
  const [filters, setFilters] = useState<KnowledgeBaseFilters>({
    category: 'all'
  });
  const [error, setError] = useState<string | null>(null);
  const [availableComponents, setAvailableComponents] = useState<ComponentOptions>({
    languages: [],
    frameworks: [],
    libraries: []
  });
  const [snippets, setSnippets] = useState<FullDocumentationSnippet[]>([]);
  
  // Track initialization state
  const componentsLoaded = useRef(false);
  const knowledgeBaseLoaded = useRef(false);
  
  // Use the vectorDB hook with sessionId
  const { 
    vectorDB,
    loading,
    error: vectorDBError,
    isInitialized,
    searchDocuments,
    getDocumentsByFilters
  } = useVectorDB(sessionId);
  
  // Update error state when vectorDBError changes
  useEffect(() => {
    if (vectorDBError) {
      console.error('Vector DB error:', vectorDBError);
      setError(vectorDBError.message);
    }
  }, [vectorDBError]);
  
  // Load available components for filters
  const loadAvailableComponents = async () => {
    if (!isInitialized) {
      console.warn('Vector DB is not initialized, cannot load components');
      return;
    }
    
    if (componentsLoaded.current) {
      console.log('Components already loaded, skipping');
      return;
    }
    
    try {
      console.log('Loading available components from vector DB...');
      
      // Get all component types
      const languageResults = await getDocumentsByFilters({ category: DocumentationCategory.LANGUAGE }, 100);
      const frameworkResults = await getDocumentsByFilters({ category: DocumentationCategory.FRAMEWORK }, 100);
      const libraryResults = await getDocumentsByFilters({ category: DocumentationCategory.LIBRARY }, 100);
      
      // Extract unique component names
      const languages = [...new Set(languageResults.map(doc => doc.language).filter(Boolean))];
      const frameworks = [...new Set(frameworkResults.map(doc => doc.framework).filter(Boolean))];
      const libraries = [...new Set(libraryResults.map(doc => doc.library).filter(Boolean))];
      
      setAvailableComponents({
        languages,
        frameworks,
        libraries
      });
      
      componentsLoaded.current = true;
      console.log('Loaded components:', { languages, frameworks, libraries });
    } catch (err) {
      console.error('Error loading components:', err);
      setError('Failed to load available components');
    }
  };
  
  // Search for snippets
  const searchSnippets = async (query: string, searchFilters?: KnowledgeBaseFilters) => {
    if (!query) {
      setSearchResults([]);
      return;
    }
    
    if (!isInitialized) {
      const errorMsg = 'Vector database not initialized. Please configure it in settings.';
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }
    
    try {
      // Clear previous results to free memory
      setSearchResults([]);
      setError(null);
      setSearchQuery(query);
      
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
      
      console.log(`Searching for "${query}" with filters:`, searchFiltersObj);
      
      // Search with the query and filters - limit to 10 results for memory savings
      const results = await searchDocuments(query, searchFiltersObj, 10);
      console.log(`Found ${results.length} results for "${query}"`);
      setSearchResults(results);
    } catch (err) {
      console.error('Error searching snippets:', err);
      setError('Failed to search documentation snippets');
      setSearchResults([]);
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
  
  // Load components and knowledge base when vector DB becomes initialized
  useEffect(() => {
    if (isInitialized && !componentsLoaded.current) {
      console.log('Vector DB is initialized, loading components');
      loadAvailableComponents();
    }
  }, [isInitialized]); // Depend on isInitialized instead of available

  // Load knowledge base separately
  useEffect(() => {
    if (isInitialized && !knowledgeBaseLoaded.current) {
      console.log('Vector DB is initialized, loading knowledge base');
      
      const loadKnowledgeBase = async () => {
        try {
          knowledgeBaseLoaded.current = true;
          const results = await getDocumentsByFilters({}, 100);
          console.log(`Loaded ${results.length} snippets from knowledge base`);
          setSnippets(results);
        } catch (err) {
          console.error('Error loading knowledge base:', err);
          setError(err instanceof Error ? err.message : 'Failed to load knowledge base');
        }
      };
      
      loadKnowledgeBase();
    }
  }, [isInitialized, getDocumentsByFilters]);
  
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
    snippets,
    isInitialized
  };
} 