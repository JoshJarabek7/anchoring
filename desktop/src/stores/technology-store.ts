import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { create } from 'zustand';

interface Technology {
  id: string;
  name: string;
  language?: string;
  related?: string[];
  createdAt: string;
  updatedAt: string;
}

interface TechnologyVersion {
  id: string;
  technologyId: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

interface TechnologyState {
  technologies: Technology[];
  selectedTechnology: Technology | null;
  versions: TechnologyVersion[];
  selectedVersion: TechnologyVersion | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchTechnologies: () => Promise<void>;
  selectTechnology: (technologyId: string) => Promise<void>;
  fetchVersions: (technologyId: string) => Promise<void>;
  selectVersion: (versionId: string) => void;
  createTechnology: (name: string, language?: string) => Promise<void>;
  createVersion: (technologyId: string, version: string) => Promise<void>;
  deleteTechnology: (technologyId: string) => Promise<void>;
  deleteVersion: (versionId: string) => Promise<void>;
}

export const useTechnologyStore = create<TechnologyState>((set, get) => ({
  technologies: [],
  selectedTechnology: null,
  versions: [],
  selectedVersion: null,
  isLoading: false,
  error: null,
  
  fetchTechnologies: async () => {
    try {
      console.log("Starting to fetch technologies");
      set({ isLoading: true, error: null });
      const rawTechnologies = await invoke<Technology[]>('get_technologies');
      console.log("Technologies received from backend:", rawTechnologies);
      
      // Transform snake_case properties to camelCase
      // const technologies = rawTechnologies.map(t => ({
      //   id: t.id,
      //   name: t.name,
      //   language: t.language,
      //   related: t.related,
      //   createdAt: t.createdAt,
      //   updatedAt: t.updatedAt
      // }));
      
      set({ technologies: rawTechnologies, isLoading: false });
      
      // If technologies exist and none is selected, select the first one
      if (rawTechnologies.length > 0 && !get().selectedTechnology) {
        console.log("Selecting first technology:", rawTechnologies[0]);
        await get().selectTechnology(rawTechnologies[0].id);
      } else if (rawTechnologies.length === 0) {
        console.log("No technologies found in the database");
      }
    } catch (error) {
      console.error("Error fetching technologies:", error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch technologies'
      });
    }
  },
  
  selectTechnology: async (technologyId: string) => {
    console.log("Selecting technology with ID:", technologyId);
    const { technologies } = get();
    const technology = technologies.find(tech => tech.id === technologyId) || null;
    console.log("Found technology:", technology);
    
    set({ selectedTechnology: technology, selectedVersion: null });
    
    if (technology) {
      await get().fetchVersions(technology.id);
    } else {
      console.warn("Could not find technology with ID:", technologyId);
    }
  },
  
  fetchVersions: async (technologyId: string) => {
    try {
      console.log("Fetching versions for technology ID:", technologyId);
      set({ isLoading: true, error: null });
      const versions = await invoke<TechnologyVersion[]>('get_technology_versions', {
        technologyId: technologyId
      });
      console.log("Versions received from backend:", versions);
      set({ versions, isLoading: false });
      
      // If versions exist, select the first one
      if (versions.length > 0) {
        console.log("Selecting first version:", versions[0]);
        get().selectVersion(versions[0].id);
      } else {
        console.log("No versions found for technology ID:", technologyId);
      }
    } catch (error) {
      console.error("Error fetching versions:", error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch versions'
      });
    }
  },
  
  selectVersion: (versionId: string) => {
    const { versions } = get();
    const version = versions.find(ver => ver.id === versionId) || null;
    set({ selectedVersion: version });
  },
  
  createTechnology: async (name: string, language?: string) => {
    try {
      set({ isLoading: true, error: null });
      const technology = await invoke<Technology>('create_technology', {
        name,
        language
      });
      
      set(state => ({ 
        technologies: [...state.technologies, technology],
        isLoading: false 
      }));
      
      // Select the newly created technology
      await get().selectTechnology(technology.id);
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to create technology'
      });
    }
  },
  
  createVersion: async (technologyId: string, version: string) => {
    try {
      console.log("Creating version:", version, "for technology ID:", technologyId);
      set({ isLoading: true, error: null });
      const newVersion = await invoke<TechnologyVersion>('create_technology_version', {
        technologyId: technologyId,
        version
      });
      console.log("Version created successfully:", newVersion);
      
      set(state => ({ 
        versions: [...state.versions, newVersion],
        isLoading: false 
      }));
      
      // Select the newly created version
      get().selectVersion(newVersion.id);
      console.log("Version selected, current state:", get().selectedVersion);
    } catch (error) {
      console.error("Error creating version:", error);
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to create version'
      });
      
      // Show toast notification for the error
      toast?.error('Failed to create version', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    }
  },
  
  deleteTechnology: async (technologyId: string) => {
    try {
      set({ isLoading: true, error: null });
      const success = await invoke<boolean>('delete_technology', {
        technologyId: technologyId
      });
      
      if (success) {
        set(state => ({
          technologies: state.technologies.filter(tech => tech.id !== technologyId),
          selectedTechnology: state.selectedTechnology?.id === technologyId ? null : state.selectedTechnology,
          versions: state.selectedTechnology?.id === technologyId ? [] : state.versions,
          selectedVersion: state.selectedTechnology?.id === technologyId ? null : state.selectedVersion,
          isLoading: false
        }));
        
        // If there are other technologies, select the first one
        const { technologies } = get();
        if (technologies.length > 0 && !get().selectedTechnology) {
          await get().selectTechnology(technologies[0].id);
        }
      }
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to delete technology'
      });
    }
  },
  
  deleteVersion: async (versionId: string) => {
    try {
      set({ isLoading: true, error: null });
      const success = await invoke<boolean>('delete_technology_version', {
        versionId: versionId
      });
      
      if (success) {
        set(state => ({
          versions: state.versions.filter(ver => ver.id !== versionId),
          selectedVersion: state.selectedVersion?.id === versionId ? null : state.selectedVersion,
          isLoading: false
        }));
        
        // If there are other versions, select the first one
        const { versions } = get();
        if (versions.length > 0 && !get().selectedVersion) {
          get().selectVersion(versions[0].id);
        }
      }
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to delete version'
      });
    }
  }
}));
