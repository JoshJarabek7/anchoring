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
      const url = await invoke<DocumentationUrl | null>('get_full_documentation_url', {
        urlId: urlId
      });
      set({ isLoading: false });
      return url;
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
    set(state => ({
      urls: state.urls.map(url => 
        url.id === urlId 
          ? { ...url, status } 
          : url
      )
    }));
  },
  
  toggleUrlSelection: (urlId) => {
    set(state => {
      const { selectedUrls } = state;
      const isSelected = selectedUrls.includes(urlId);
      
      return {
        selectedUrls: isSelected
          ? selectedUrls.filter(id => id !== urlId)
          : [...selectedUrls, urlId]
      };
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
      console.log("Fetching crawling settings for versionId:", versionId);
      set({ isLoading: true, error: null });
      
      console.log("Making backend call to get_version_crawling_settings...");
      const settings = await invoke<CrawlingSettings | null>('get_version_crawling_settings', {
        versionId: versionId
      });
      
      console.log("Received crawling settings:", settings);
      if (settings) {
        console.log("Settings ID:", settings.id);
        console.log("Settings data:", {
          prefixPath: settings.prefixPath,
          antiPaths: settings.antiPaths,
          antiKeywords: settings.antiKeywords
        });
      } else {
        console.warn("No settings received from backend - this should not happen with the updated backend");
      }
      
      set({ currentCrawlingSettings: settings, isLoading: false });
    } catch (error) {
      console.error("Error fetching crawling settings:", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch crawling settings'
      });
    }
  },
  
  saveCrawlingSettings: async (settings: Partial<CrawlingSettings>) => {
    try {
      set({ isLoading: true, error: null });
      
      console.log("Saving crawling settings with data:", settings);
      
      // Send settings directly without any case conversion - backend handles it
      const updatedSettings = await invoke<CrawlingSettings>('save_version_crawling_settings', settings);
      console.log("Received updated settings from backend:", updatedSettings);
      
      if (updatedSettings) {
        set({ currentCrawlingSettings: updatedSettings, isLoading: false });
        return updatedSettings;
      } else {
        throw new Error("No settings returned from backend");
      }
    } catch (error) {
      console.error("Failed to save crawling settings:", error);
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
      const skippedCount = await invoke<number>('apply_url_filters', {
        versionId: versionId
      });
      
      // After applying filters, refresh URLs
      await get().fetchUrls(versionId);
      
      set({ isLoading: false });
      return skippedCount;
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