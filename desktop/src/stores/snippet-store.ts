import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

export interface DocumentationSnippet {
  id: string;
  title: string;
  description: string;
  content: string;
  sourceUrl: string;
  technologyId: string;
  versionId: string;
  concepts?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResults {
  results: DocumentationSnippet[];
  totalCount: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface SearchResult {
  id: string;
  similarity: number;
  content: string;
  metadata: string;
  technologyName: string;
  technologyLanguage: string | null;
  technologyRelated: string | null;
  version: string;
  sourceUrl: string;
  title: string;
  description: string;
  concepts: string | null;
}

interface SnippetState {
  snippets: DocumentationSnippet[];
  filteredSnippets: DocumentationSnippet[];
  searchResults: SearchResult[];
  pagination: {
    page: number;
    perPage: number;
    totalPages: number;
    totalCount: number;
  };
  searchQuery: string;
  selectedSnippetId: string | null;
  isLoading: boolean;
  error: string | null;
  concepts: string[];
  selectedConcepts: string[];
  isGlobalSearch: boolean;
  
  // Actions
  fetchSnippets: (versionId: string) => Promise<void>;
  getSnippet: (snippetId: string) => Promise<DocumentationSnippet | null>;
  selectSnippet: (snippetId: string | null) => void;
  searchSnippets: (query: string) => void;
  searchByVector: (query: string, page?: number, perPage?: number) => Promise<void>;
  filterByTags: (tags: string[]) => void;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  fetchAllConcepts: () => Promise<void>;
  toggleConceptFilter: (concept: string) => void;
  clearConceptFilters: () => void;
  toggleGlobalSearch: () => void;
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  snippets: [],
  filteredSnippets: [],
  searchResults: [],
  pagination: {
    page: 1,
    perPage: 10,
    totalPages: 0,
    totalCount: 0
  },
  searchQuery: '',
  selectedSnippetId: null,
  isLoading: false,
  error: null,
  concepts: [],
  selectedConcepts: [],
  isGlobalSearch: false,
  
  fetchSnippets: async (versionId) => {
    console.log('Starting fetchSnippets with versionId:', versionId);
    try {
      if (!versionId) {
        console.error('No versionId provided to fetchSnippets');
        set({
          isLoading: false,
          error: 'No version ID provided'
        });
        return;
      }
      
      set({ isLoading: true, error: null });
      
      console.log('Invoking get_documentation_snippets...');
      const backendSnippets = await invoke<DocumentationSnippet[]>('get_documentation_snippets', {
        versionId: versionId
      });
      
      console.log(`Received ${backendSnippets?.length || 0} snippets from backend`);
      
      // Validate the response
      if (!Array.isArray(backendSnippets)) {
        throw new Error('Backend returned invalid data format');
      }
      
      // Map snake_case properties to camelCase if needed
      const formattedSnippets = backendSnippets.map(snippet => ({
        id: snippet.id,
        title: snippet.title,
        description: snippet.description,
        content: snippet.content,
        sourceUrl: snippet.sourceUrl || '',
        technologyId: snippet.technologyId || '',
        versionId: snippet.versionId || '',
        concepts: snippet.concepts || [],
        createdAt: snippet.createdAt || new Date().toISOString(),
        updatedAt: snippet.updatedAt || new Date().toISOString()
      }));
      
      console.log('Formatted snippets:', formattedSnippets.slice(0, 2)); // Log first two for debug
      
      set({ 
        snippets: formattedSnippets, 
        filteredSnippets: formattedSnippets,
        isLoading: false,
        pagination: {
          ...get().pagination,
          totalCount: formattedSnippets.length,
          totalPages: Math.ceil(formattedSnippets.length / get().pagination.perPage)
        }
      });
      
      console.log('Updated store with snippets state');
    } catch (error) {
      console.error('Error in fetchSnippets:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch snippets',
        snippets: [],
        filteredSnippets: []
      });
    }
  },
  
  getSnippet: async (snippetId) => {
    try {
      // First check search results
      const searchResult = get().searchResults.find(r => r.id === snippetId);
      if (searchResult) {
        return {
          id: searchResult.id,
          title: searchResult.title,
          description: searchResult.description,
          content: searchResult.content,
          sourceUrl: searchResult.sourceUrl,
          technologyId: '', // Not available in search results
          versionId: '', // Not available in search results
          concepts: searchResult.concepts ? JSON.parse(searchResult.concepts) : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      
      // Then check cache
      const cachedSnippet = get().snippets.find(s => s.id === snippetId);
      if (cachedSnippet) return cachedSnippet;
      
      // Otherwise fetch from backend
      set({ isLoading: true, error: null });
      
      const backendSnippet = await invoke<DocumentationSnippet | null>('get_documentation_snippet', {
        snippetId: snippetId
      });
      
      set({ isLoading: false });
      
      return backendSnippet;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : `Failed to get snippet ${snippetId}`
      });
      return null;
    }
  },
  
  selectSnippet: (snippetId) => {
    set({ selectedSnippetId: snippetId });
  },
  
  searchSnippets: (query) => {
    set(state => {
      const { snippets } = state;
      const lowerQuery = query.toLowerCase();
      
      const filtered = snippets.filter(snippet => 
        snippet.title.toLowerCase().includes(lowerQuery) ||
        snippet.description.toLowerCase().includes(lowerQuery) ||
        snippet.content.toLowerCase().includes(lowerQuery) ||
        snippet.concepts?.some(concept => concept.toLowerCase().includes(lowerQuery))
      );
      
      return { 
        searchQuery: query,
        filteredSnippets: filtered,
        pagination: {
          ...state.pagination,
          page: 1,
          totalCount: filtered.length,
          totalPages: Math.ceil(filtered.length / state.pagination.perPage)
        }
      };
    });
  },
  
  searchByVector: async (query, page = 1, perPage = 10) => {
    if (!query || query.trim().length === 0) {
      // Reset to standard snippet list if query is empty
      set(state => ({
        searchResults: [],
        filteredSnippets: state.snippets,
        searchQuery: '',
        pagination: {
          ...state.pagination,
          page: 1,
          totalCount: state.snippets.length,
          totalPages: Math.ceil(state.snippets.length / state.pagination.perPage)
        }
      }));
      return;
    }
    
    try {
      set({ isLoading: true, error: null, searchResults: [] });
      
      // Prepare filter string from selected concepts
      const { selectedConcepts, isGlobalSearch } = get();
      let filterStr = '';
      
      if (selectedConcepts.length > 0) {
        // Create a JSON filter for concepts
        filterStr = JSON.stringify({
          concepts: selectedConcepts
        });
      }
      
      // Get the current version
      const versionId = get().snippets[0]?.versionId;
      console.log("Vector search with version:", versionId, "and query:", query);
      console.log("Global search:", isGlobalSearch, "filter:", filterStr);
      
      // Call the Tauri command for vector search
      const results = await invoke<{
        results: SearchResult[];
        totalCount: number;
        page: number;
        perPage: number;
        totalPages: number;
      }>('vector_search_snippets', {
        query,
        page,
        perPage,
        filter: filterStr || undefined,
        versionId: versionId || undefined,
        globalSearch: isGlobalSearch
      });
      
      // Log raw similarity values to understand the scale
      const similarityValues = results.results.slice(0, 5).map(r => r.similarity);
      console.log("Vector search results:", {
        count: results.results.length,
        totalCount: results.totalCount,
        page: results.page,
        totalPages: results.totalPages,
        firstResult: results.results.length > 0 ? {
          similarity: results.results[0].similarity,
          title: results.results[0].title,
          concepts: results.results[0].concepts
        } : null,
        // Show first 5 similarity values to help debug
        similarityValues
      });
      
      // Pre-process the results to convert comma-separated concepts to JSON arrays
      const processedResults = results.results.map(result => {
        // Handle concepts - backend returns comma-separated string, but frontend expects JSON array
        if (result.concepts) {
          try {
            // First try to parse as JSON in case it's already JSON
            JSON.parse(result.concepts);
          } catch (e) {
            // Not valid JSON, so it's likely a comma-separated string
            // Convert to a proper JSON array
            const conceptsArray = result.concepts
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            
            result.concepts = JSON.stringify(conceptsArray);
            console.log("Converted concepts to JSON array for result:", result.id);
          }
        } else {
          // Ensure concepts is a valid JSON array if missing
          result.concepts = "[]";
        }
        return result;
      });
      
      set({
        searchResults: processedResults,
        searchQuery: query,
        isLoading: false,
        pagination: {
          page: results.page,
          perPage: results.perPage,
          totalCount: results.totalCount,
          totalPages: results.totalPages
        }
      });
    } catch (error) {
      console.error("Vector search error:", error);
      set({
        searchResults: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to perform vector search'
      });
    }
  },
  
  filterByTags: (tags) => {
    set(state => {
      const { snippets, searchQuery } = state;
      const lowerQuery = searchQuery.toLowerCase();
      
      // First apply search query if any
      let filtered = searchQuery 
        ? snippets.filter(snippet => 
            snippet.title.toLowerCase().includes(lowerQuery) ||
            snippet.description.toLowerCase().includes(lowerQuery) ||
            snippet.content.toLowerCase().includes(lowerQuery) ||
            snippet.concepts?.some(concept => concept.toLowerCase().includes(lowerQuery))
          )
        : [...snippets];
      
      // Then apply tag filter if any tags are specified
      if (tags && tags.length > 0) {
        filtered = filtered.filter(snippet => 
          tags.some(tag => snippet.concepts?.includes(tag))
        );
      }
      
      return { 
        filteredSnippets: filtered,
        pagination: {
          ...state.pagination,
          page: 1,
          totalCount: filtered.length,
          totalPages: Math.ceil(filtered.length / state.pagination.perPage)
        }
      };
    });
  },
  
  setPage: (page) => {
    set(state => ({
      pagination: {
        ...state.pagination,
        page
      }
    }));
    
    // If we're in vector search mode, re-trigger the search with the new page
    const { searchQuery } = get();
    if (searchQuery) {
      get().searchByVector(searchQuery, page, get().pagination.perPage);
    }
  },
  
  setPerPage: (perPage) => {
    set(state => {
      const { snippets, filteredSnippets, searchResults } = state;
      const totalCount = searchResults.length > 0 ? state.pagination.totalCount : filteredSnippets.length;
      
      return {
        pagination: {
          ...state.pagination,
          perPage,
          page: 1, // Reset to first page on per page change
          totalPages: Math.ceil(totalCount / perPage)
        }
      };
    });
    
    // If we're in vector search mode, re-trigger the search with the new per-page setting
    const { searchQuery } = get();
    if (searchQuery) {
      get().searchByVector(searchQuery, 1, perPage);
    }
  },
  
  fetchAllConcepts: async () => {
    try {
      set({ isLoading: true });
      const concepts = await invoke<string[]>('get_snippet_concepts');
      set({ concepts, isLoading: false });
    } catch (error) {
      set({ 
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch concepts'
      });
    }
  },
  
  toggleConceptFilter: (concept) => {
    set(state => {
      const { selectedConcepts } = state;
      const newSelectedConcepts = selectedConcepts.includes(concept)
        ? selectedConcepts.filter(c => c !== concept)
        : [...selectedConcepts, concept];
        
      return { selectedConcepts: newSelectedConcepts };
    });
    
    // Reapply filter
    get().filterByTags(get().selectedConcepts);
    
    // If in vector search mode, re-trigger search with updated concept filters
    const { searchQuery } = get();
    if (searchQuery) {
      get().searchByVector(searchQuery, 1, get().pagination.perPage);
    }
  },
  
  clearConceptFilters: () => {
    set({ selectedConcepts: [] });
    
    // Reset filters
    get().filterByTags([]);
    
    // If in vector search mode, re-trigger search with cleared filters
    const { searchQuery } = get();
    if (searchQuery) {
      get().searchByVector(searchQuery, 1, get().pagination.perPage);
    }
  },
  
  toggleGlobalSearch: () => {
    set(state => ({ isGlobalSearch: !state.isGlobalSearch }));
    
    // If in vector search mode, re-trigger search with new global setting
    const { searchQuery } = get();
    if (searchQuery) {
      get().searchByVector(searchQuery, 1, get().pagination.perPage);
    }
  }
}));