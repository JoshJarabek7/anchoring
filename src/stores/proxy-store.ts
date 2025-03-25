import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';

interface Proxy {
  id: string;
  url: string;
  lastUsed?: string;
}

interface ProxyState {
  proxies: Proxy[];
  activeSettingsTab: string;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchProxies: () => Promise<void>;
  fetchAndSaveProxies: () => Promise<void>;
  setActiveSettingsTab: (tab: string) => void;
}

export const useProxyStore = create<ProxyState>((set) => ({
  proxies: [],
  activeSettingsTab: 'proxy',
  isLoading: false,
  error: null,
  
  fetchProxies: async () => {
    try {
      set({ isLoading: true, error: null });
      const proxies = await invoke<Proxy[]>('get_proxies');
      set({ proxies, isLoading: false });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch proxies'
      });
    }
  },
  
  fetchAndSaveProxies: async () => {
    try {
      set({ isLoading: true, error: null });
      const newProxies = await invoke<Proxy[]>('fetch_and_save_proxies');
      set({ proxies: newProxies, isLoading: false });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch and save proxies'
      });
    }
  },
  
  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab })
}));