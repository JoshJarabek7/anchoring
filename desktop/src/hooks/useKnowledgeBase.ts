import { useState, useEffect, useRef } from 'react';
import { useVectorDB } from './useVectorDB';
import { UniversalDocument, DocumentCategory } from '../lib/vector-db/types';

// Debug flag - set to true to enable verbose logging
const DEBUG = false;

const log = {
  debug: (...args: any[]) => DEBUG && console.log('[KnowledgeBase]:', ...args),
  error: (...args: any[]) => console.error('[KnowledgeBase Error]:', ...args)
};

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
  category: DocumentCategory | 'all';
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
  const [searchResults, setSearchResults] = useState<UniversalDocument[]>([]);
  const [filters, setFilters] = useState<KnowledgeBaseFilters>({
    category: 'all'
  });
  const [error, setError] = useState<string | null>(null);
  const [availableComponents, setAvailableComponents] = useState<ComponentOptions>({
    languages: [],
    frameworks: [],
    libraries: []
  });
  const [snippets, setSnippets] = useState<UniversalDocument[]>([]);
  
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
      log.error('Vector DB error:', vectorDBError);
      setError(vectorDBError.message);
    }
  }, [vectorDBError]);
  
  // Load available components for filters
  const loadAvailableComponents = async () => {
    if (!isInitialized) {
      log.debug('Vector DB not initialized, skipping component load');
      return;
    }
    
    if (componentsLoaded.current) {
      log.debug('Components already loaded, skipping');
      return;
    }
    
    try {
      log.debug('Loading available components...');
      
      // Get all component types
      const languageResults = await getDocumentsByFilters({ category: DocumentCategory.LANGUAGE }, 100);
      const frameworkResults = await getDocumentsByFilters({ category: DocumentCategory.FRAMEWORK }, 100);
      const libraryResults = await getDocumentsByFilters({ category: DocumentCategory.LIBRARY }, 100);
      
      // Extract unique component names
      const languages = [...new Set(languageResults.map(doc => doc.metadata.language).filter((lang): lang is string => typeof lang === 'string'))];
      const frameworks = [...new Set(frameworkResults.map(doc => doc.metadata.framework).filter((framework): framework is string => typeof framework === 'string'))];
      const libraries = [...new Set(libraryResults.map(doc => doc.metadata.library).filter((library): library is string => typeof library === 'string'))];
      
      setAvailableComponents({
        languages,
        frameworks,
        libraries
      });
      
      componentsLoaded.current = true;
      log.debug('Components loaded:', { languages, frameworks, libraries });
    } catch (err) {
      log.error('Failed to load components:', err);
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
      log.error(errorMsg);
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
      
      log.debug(`Searching with filters:`, searchFiltersObj);
      
      // Search with the query and filters - limit to 10 results for memory savings
      const results = await searchDocuments(query, searchFiltersObj, 10);
      log.debug(`Found ${results.length} results`);
      setSearchResults(results);
    } catch (err) {
      log.error('Search failed:', err);
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
      log.debug('Loading components');
      loadAvailableComponents();
    }
  }, [isInitialized]);

  // Load knowledge base separately
  useEffect(() => {
    if (isInitialized && !knowledgeBaseLoaded.current) {
      log.debug('Loading knowledge base');
      
      const loadKnowledgeBase = async () => {
        try {
          knowledgeBaseLoaded.current = true;
          const results = await getDocumentsByFilters({}, 100);
          log.debug(`Loaded ${results.length} snippets`);
          setSnippets(results);
        } catch (err) {
          log.error('Failed to load knowledge base:', err);
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