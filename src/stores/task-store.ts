import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { workerService } from '../lib/worker-service';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskStage = {
  id: string;
  name: string;
  progress: number;
  status: 'idle' | 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
};

export interface TaskPayload {
  url: string;
  prefixPath: string;
  antiPaths: string[];
  antiKeywords: string[];
  skipProcessed: boolean;
  urlId: string;
}

export interface Task {
  id: string;
  taskType: string;
  status: TaskStatus;
  progress: number;
  technologyId?: string;
  versionId?: string;
  payload: TaskPayload;
  createdAt: string;
  // Added for UI purposes
  stages?: TaskStage[];
  createdDate: Date;
}

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  initializeTasks: () => Promise<void>;
  fetchActiveTasks: () => Promise<void>;
  getTask: (taskId: string) => Promise<Task | null>;
  addTask: (task: Task) => void;
  updateTaskProgress: (taskId: string, progress: number, status: TaskStatus, stages?: TaskStage[]) => void;
  batchUpdateTasks: (tasks: Task[]) => void;
  batchUpdateProgress: (updates: Array<{ taskId: string, progress: number, status: TaskStatus, stages?: TaskStage[] }>) => void;
  removeTask: (taskId: string) => void;
  removeCompletedTasks: () => void;
  cancelTask: (taskId: string) => Promise<void>;
}

// Helper to ensure payload is properly processed
const processTaskPayload = (task: any): Task => {
  let payload = task.payload;
  
  // Try to parse payload if it's a string that looks like JSON
  if (typeof payload === 'string' && 
      (payload.startsWith('{') || payload.startsWith('['))) {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      // Keep as string if parsing fails
      console.warn(`Failed to parse task payload for task ${task.id}:`, e);
    }
  }
  
  // Ensure payload has expected structure (even if partial)
  if (payload && typeof payload === 'object') {
    // Ensure arrays are arrays
    if (!Array.isArray(payload.antiPaths)) {
      payload.antiPaths = payload.antiPaths ? [payload.antiPaths] : [];
    }
    if (!Array.isArray(payload.antiKeywords)) {
      payload.antiKeywords = payload.antiKeywords ? [payload.antiKeywords] : [];
    }
  }
  
  return {
    ...task,
    payload,
    createdDate: new Date(task.createdAt)
  };
};

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,
  
  initializeTasks: async () => {
    try {
      set({ isLoading: true, error: null });
      await get().fetchActiveTasks();
      set({ isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize tasks'
      });
    }
  },
  
  fetchActiveTasks: async () => {
    try {
      set({ isLoading: true, error: null });
      const activeTasks = await invoke<Task[]>('get_active_tasks');
      
      // Process tasks with web worker for better performance
      workerService.sendMessage('PROCESS_TASKS', { tasks: activeTasks }, (processedTasks) => {
        // Set state with worker-processed tasks
        set({ tasks: processedTasks, isLoading: false });
      }).catch(error => {
        // Fallback to processing in the main thread if worker fails
        const processedTasks = activeTasks.map(processTaskPayload);
        set({ tasks: processedTasks, isLoading: false });
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch active tasks'
      });
    }
  },
  
  getTask: async (taskId: string) => {
    // First check local state
    const localTask = get().tasks.find(task => task.id === taskId);
    if (localTask) return localTask;
    
    // Otherwise fetch from backend
    try {
      const task = await invoke<Task | null>('get_task', { taskId: taskId });
      if (task) {
        return processTaskPayload(task);
      }
      return null;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : `Failed to get task ${taskId}`
      });
      return null;
    }
  },
  
  addTask: (task) => {
    set(state => {
      // Check if task with this ID already exists
      const taskExists = state.tasks.some(t => t.id === task.id);
      if (taskExists) {
        // Just update the existing task instead of adding a duplicate
        return {
          tasks: state.tasks.map(t => 
            t.id === task.id ? processTaskPayload(task) : t
          )
        };
      }
      // Add new task
      return {
        tasks: [...state.tasks, processTaskPayload(task)]
      };
    });
  },
  
  updateTaskProgress: (taskId, progress, status, stages) => {
    set(state => {
      const taskIndex = state.tasks.findIndex(task => task.id === taskId);
      if (taskIndex === -1) return state;

      const updatedTasks = [...state.tasks];
      updatedTasks[taskIndex] = {
        ...updatedTasks[taskIndex],
        progress,
        status,
        ...(stages ? { stages } : {})
      };

      // If task is completed, failed, or cancelled, schedule it for removal
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        setTimeout(() => {
          get().removeTask(taskId);
        }, status === 'completed' ? 3000 : 5000); // Remove completed tasks faster than failed/cancelled
      }

      return { tasks: updatedTasks };
    });
  },
  
  // New method for batch updating tasks using worker
  batchUpdateTasks: (tasks) => {
    // Use worker to process tasks efficiently
    workerService.sendMessage('PROCESS_TASKS', { tasks }, (processedTasks) => {
      // Update state with all processed tasks at once
      set(state => {
        // Create map of existing tasks by ID for quick lookups
        const currentTaskMap = new Map(state.tasks.map(task => [task.id, task]));
        
        // Process updates maintaining any existing tasks not in the update
        const updatedTasks = [...state.tasks];
        
        processedTasks.forEach(processedTask => {
          const taskIndex = updatedTasks.findIndex(t => t.id === processedTask.id);
          
          if (taskIndex >= 0) {
            // Update existing task
            updatedTasks[taskIndex] = processedTask;
          } else {
            // Add new task
            updatedTasks.push(processedTask);
          }
        });
        
        return { tasks: updatedTasks };
      });
    });
  },
  
  // Batch update task progress for multiple tasks at once
  batchUpdateProgress: (updates) => {
    if (updates.length === 0) return;
    
    set(state => {
      // Create a new tasks array to hold the updated tasks
      const updatedTasks = [...state.tasks];
      
      // Process each update
      for (const update of updates) {
        const { taskId, progress, status, stages } = update;
        
        // Find the task to update
        const taskIndex = updatedTasks.findIndex(task => task.id === taskId);
        
        // Skip if task not found
        if (taskIndex === -1) continue;
        
        // Update the task at that index
        updatedTasks[taskIndex] = {
          ...updatedTasks[taskIndex],
          progress,
          status,
          ...(stages ? { stages } : {})
        };
      }
      
      return { tasks: updatedTasks };
    });
  },
  
  removeTask: (taskId) => {
    set(state => {
      // Check if task exists before attempting to remove
      const taskExists = state.tasks.some(t => t.id === taskId);
      
      if (!taskExists) {
        // No changes needed if task doesn't exist
        return state;
      }
      
      return {
        tasks: state.tasks.filter(task => task.id !== taskId)
      };
    });
  },
  
  // Remove all completed tasks at once
  removeCompletedTasks: () => {
    set(state => ({
      tasks: state.tasks.filter(task => 
        task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled'
      )
    }));
  },
  
  cancelTask: async (taskId) => {
    try {
      set({ isLoading: true, error: null });
      await invoke('cancel_task', { taskId: taskId });
      
      // Update local state to show cancellation
      set(state => ({
        tasks: state.tasks.map(task => 
          task.id === taskId 
            ? { ...task, status: 'cancelled' as TaskStatus }
            : task
        ),
        isLoading: false
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : `Failed to cancel task ${taskId}`
      });
    }
  }
}));