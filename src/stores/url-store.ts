import { invoke, Channel } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { CrawlEvent, MarkdownEvent, SnippetEvent } from '@/types/events';

export type UrlStatus = 
  | 'pending_crawl'
  | 'crawling'
  | 'crawled'
  | 'crawl_error'
  | 'pending_markdown'
  | 'converting_markdown'
  | 'markdown_ready'
  | 'markdown_error'
  | 'pending_processing'
  | 'processing'
  | 'processed'
  | 'processing_error'
  | 'skipped';

export interface DocumentationUrl {
  id: string;
  technologyId: string;
  versionId: string;
  url: string;
  status: UrlStatus;
  html?: string;
  markdown?: string;
  cleanedMarkdown?: string;
  isProcessed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CrawlingSettings {
  id: string;
  versionId: string;
  prefixPath?: string;
  antiPaths?: string;
  antiKeywords?: string;
  skipProcessed?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UrlState {
  urls: DocumentationUrl[];
  selectedUrls: string[];
  currentCrawlingSettings: CrawlingSettings | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchUrls: (versionId: string, includeContent?: boolean) => Promise<void>;
  fetchUrl: (urlId: string) => Promise<DocumentationUrl | null>;
  addUrl: (url: string, technologyId: string, versionId: string) => Promise<void>;
  updateUrlStatus: (urlId: string, status: UrlStatus) => void;
  toggleUrlSelection: (urlId: string) => void;
  selectAllUrls: () => void;
  clearUrlSelection: () => void;
  fetchCrawlingSettings: (versionId: string) => Promise<void>;
  saveCrawlingSettings: (settings: Partial<CrawlingSettings>) => Promise<CrawlingSettings>;
  applyUrlFilters: (versionId: string) => Promise<number>;
  startCrawling: (settings: {
    technologyId: string;
    versionId: string;
    startUrl: string;
    prefixPath: string;
    antiPaths?: string[];
    antiKeywords?: string[];
    skipProcessedUrls?: boolean;
    onEvent: Channel<CrawlEvent>;
  }) => Promise<string>;
  cleanMarkdown: (urlIds: string[], onEvent: Channel<MarkdownEvent>) => Promise<string[]>;
  generateSnippets: (urlIds: string[], onEvent: Channel<SnippetEvent>) => Promise<string[]>;
}

export const useUrlStore = create<UrlState>((set, get) => ({
  urls: [],
  selectedUrls: [],
  currentCrawlingSettings: null,
  isLoading: false,
  error: null,
  
  fetchUrls: async (versionId, includeContent = false) => {
    try {
      set({ isLoading: true, error: null });
      const urls = await invoke<DocumentationUrl[]>('get_version_documentation_urls', {
        versionId: versionId,
        includeContent: includeContent
      });
      set({ urls, isLoading: false, selectedUrls: [] });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch URLs'
      });
    }
  },
  
  fetchUrl: async (urlId) => {
    try {
      set({ isLoading: true, error: null });
      
      // Always include full content when fetching individual URL details
      const url = await invoke<DocumentationUrl>('get_full_documentation_url', {
        urlId
      });
      
      set({ isLoading: false });
      return url || null;
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : `Failed to fetch URL ${urlId}`
      });
      return null;
    }
  },
  
  addUrl: async (url, technologyId, versionId) => {
    try {
      set({ isLoading: true, error: null });
      const newUrl = await invoke<DocumentationUrl>('add_documentation_url', {
        url,
        technologyId: technologyId,
        versionId: versionId
      });
      
      set(state => ({
        urls: [...state.urls, newUrl],
        isLoading: false
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to add URL'
      });
    }
  },
  
  updateUrlStatus: (urlId, status) => {
    set(state => {
      const url = state.urls.find(u => u.id === urlId);
      
      // Only update if status is actually changing
      if (url && url.status !== status) {
        return {
          urls: state.urls.map(url => 
            url.id === urlId 
              ? { ...url, status } 
              : url
          )
        };
      }
      
      // Return unchanged state if nothing changes
      return { urls: state.urls };
    });
  },
  
  toggleUrlSelection: (urlId) => {
    set(state => {
      const { selectedUrls } = state;
      const isSelected = selectedUrls.includes(urlId);
      
      // Only update state if it's actually changing
      if (!isSelected && !selectedUrls.includes(urlId)) {
        return { selectedUrls: [...selectedUrls, urlId] };
      } else if (isSelected) {
        return { selectedUrls: selectedUrls.filter(id => id !== urlId) };
      }
      
      // Return unchanged state if nothing changes
      return { selectedUrls };
    });
  },
  
  selectAllUrls: () => {
    set(state => ({
      selectedUrls: state.urls.map(url => url.id)
    }));
  },
  
  clearUrlSelection: () => {
    set({ selectedUrls: [] });
  },
  
  fetchCrawlingSettings: async (versionId) => {
    try {
      set({ isLoading: true, error: null });
      
      // This will always return settings due to get_or_create_default behavior
      const settings = await invoke<CrawlingSettings>('get_version_crawling_settings', {
        versionId: versionId
      });
      
      if (settings) {
        set({ currentCrawlingSettings: settings, isLoading: false });
      } else {
        console.error("No crawling settings returned - this should not happen");
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Error fetching crawling settings:", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch crawling settings'
      });
    }
  },
  
  saveCrawlingSettings: async (settings) => {
    try {
      set({ isLoading: true, error: null });
      
      // Ensure we're updating the correct settings
      const result = await invoke<CrawlingSettings>('save_version_crawling_settings', {
        crawlingSettingsId: settings.id, // This should exist now
        versionId: settings.versionId,
        prefixPath: settings.prefixPath,
        antiPaths: settings.antiPaths,
        antiKeywords: settings.antiKeywords,
        skipProcessed: settings.skipProcessed
      });
      
      // Update state with the updated settings
      set({ currentCrawlingSettings: result, isLoading: false });
      
      return result;
    } catch (error) {
      console.error("Error saving crawling settings:", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to save crawling settings'
      });
      throw error;
    }
  },
  
  applyUrlFilters: async (versionId) => {
    try {
      set({ isLoading: true, error: null });
      const deletedCount = await invoke<number>('apply_url_filters', {
        versionId: versionId
      });
      
      // After applying filters, refresh URLs
      await get().fetchUrls(versionId);
      
      set({ isLoading: false });
      return deletedCount;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to apply URL filters'
      });
      return 0;
    }
  },
  
  startCrawling: async (settings: {
    technologyId: string;
    versionId: string;
    startUrl: string;
    prefixPath: string;
    antiPaths?: string[];
    antiKeywords?: string[];
    skipProcessedUrls?: boolean;
    onEvent: Channel<CrawlEvent>;
  }) => {
    try {
      set({ isLoading: true, error: null });
      const taskId = await invoke<string>('start_crawling', settings);
      set({ isLoading: false });
      return taskId;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start crawling'
      });
      throw error;
    }
  },
  
  cleanMarkdown: async (urlIds: string[], onEvent: Channel<MarkdownEvent>) => {
    try {
      set({ isLoading: true, error: null });
      const taskIds = await invoke<string[]>('clean_markdown', {
        urlIds,
        onEvent
      });
      set({ isLoading: false });
      return taskIds;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to clean markdown'
      });
      throw error;
    }
  },
  
  generateSnippets: async (urlIds: string[], onEvent: Channel<SnippetEvent>) => {
    try {
      set({ isLoading: true, error: null });
      const taskIds = await invoke<string[]>('generate_snippets', {
        urlIds,
        onEvent
      });
      set({ isLoading: false });
      return taskIds;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to generate snippets'
      });
      throw error;
    }
  },
}));