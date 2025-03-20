import { create } from 'zustand';

type ViewType = 'deepDive' | 'knowledgeReef';

interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  taskQueueOpen: boolean;
  settingsOpen: boolean;
  taskDetailsOpen: boolean;
  technologySelectorOpen: boolean;
  activeSettingsTab: string;
  activeTaskId: string | null;
  mobileModeActive: boolean;
  activeView: ViewType;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleTaskQueue: () => void;
  setTaskQueueOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveSettingsTab: (tab: string) => void;
  toggleTaskDetails: (taskId?: string) => void;
  toggleTechnologySelector: () => void;
  setTechnologySelectorOpen: (open: boolean) => void;
  setMobileModeActive: (active: boolean) => void;
  setActiveView: (view: ViewType) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  sidebarCollapsed: true,
  taskQueueOpen: false,
  settingsOpen: false,
  taskDetailsOpen: false,
  technologySelectorOpen: false,
  activeSettingsTab: 'proxy',
  activeTaskId: null,
  mobileModeActive: false,
  activeView: 'deepDive', // Default view
  
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
  
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  toggleSidebarCollapsed: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  
  toggleTaskQueue: () => set(state => ({ taskQueueOpen: !state.taskQueueOpen })),
  
  setTaskQueueOpen: (open) => set({ taskQueueOpen: open }),
  
  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  
  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),
  
  toggleTaskDetails: (taskId) => set(state => {
    if (taskId) {
      return {
        taskDetailsOpen: !state.taskDetailsOpen || state.activeTaskId !== taskId,
        activeTaskId: taskId
      };
    }
    return { taskDetailsOpen: !state.taskDetailsOpen };
  }),
  
  toggleTechnologySelector: () => set(state => ({ technologySelectorOpen: !state.technologySelectorOpen })),
  
  setTechnologySelectorOpen: (open) => set({ technologySelectorOpen: open }),
  
  setMobileModeActive: (active) => set({ mobileModeActive: active }),
  
  setActiveView: (view) => set({ activeView: view })
}));