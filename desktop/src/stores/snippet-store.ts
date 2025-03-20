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

interface SnippetState {
  snippets: DocumentationSnippet[];
  filteredSnippets: DocumentationSnippet[];
  searchQuery: string;
  selectedSnippetId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchSnippets: (versionId: string) => Promise<void>;
  getSnippet: (snippetId: string) => Promise<DocumentationSnippet | null>;
  selectSnippet: (snippetId: string | null) => void;
  searchSnippets: (query: string) => void;
  filterByTags: (tags: string[]) => void;
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  snippets: [],
  filteredSnippets: [],
  searchQuery: '',
  selectedSnippetId: null,
  isLoading: false,
  error: null,
  
  fetchSnippets: async (versionId) => {
    try {
      set({ isLoading: true, error: null });
      
      const backendSnippets = await invoke<DocumentationSnippet[]>('get_documentation_snippets', {
        versionId: versionId
      });
      
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
      
      set({ 
        snippets: formattedSnippets, 
        filteredSnippets: formattedSnippets,
        isLoading: false 
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch snippets'
      });
    }
  },
  
  getSnippet: async (snippetId) => {
    try {
      // First check cache
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
        filteredSnippets: filtered
      };
    });
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
      
      return { filteredSnippets: filtered };
    });
  }
}));