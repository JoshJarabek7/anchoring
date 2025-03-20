import { TaskStatus, useTaskStore } from '@/stores/task-store';
import { useTechnologyStore } from '@/stores/technology-store';
import { useUrlStore } from '@/stores/url-store';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';

// Create unlisten functions holder to properly clean up listeners
// Type is correct for Tauri v2 unlisten functions
const unlistenFunctions: Array<() => void> = [];

/**
 * Set up event listeners for Tauri events
 * This is a centralized place for all event subscriptions
 */
export async function setupEventListeners() {
  try {
    // Store getters - these will get the latest state methods when called
    const getTaskStore = () => useTaskStore.getState();
    const getUrlStore = () => useUrlStore.getState();
    const getTechStore = () => useTechnologyStore.getState();
    
    // Keep track of processed task IDs to prevent double-processing
    const processedTaskIds = new Set<string>();
    
    // Task Events
    const taskCreated = await listen<{ taskId: string, taskType: string, metadata: string }>('task:created', (event) => {
      try {
        // Skip if this task was already processed
        if (!event.payload || !event.payload.taskId) return;
        
        const taskId = event.payload.taskId;
        if (processedTaskIds.has(taskId)) {
          console.log(`Task ${taskId} already processed, skipping duplicate event`);
          return;
        }
        
        // Mark this task ID as processed
        processedTaskIds.add(taskId);
        
        // Parse metadata if it's a string
        const metadata = typeof event.payload.metadata === 'string' 
          ? JSON.parse(event.payload.metadata) 
          : event.payload.metadata;
        
        console.log('Task created:', {
          taskId: taskId,
          taskType: event.payload.taskType,
          metadata
        });
        
        // Add a minimal task to the store immediately with 'queued' status
        const minimalTask = {
          id: taskId,
          taskType: event.payload.taskType,
          status: 'queued' as TaskStatus,
          progress: 0,
          payload: metadata,
          createdAt: new Date().toISOString(),
          createdDate: new Date()
        };
        
        // Add the minimal task to show immediately in the queue
        getTaskStore().addTask(minimalTask);
        
        // Also fetch the full task data from the backend
        getTaskStore().getTask(taskId).then(fullTask => {
          if (fullTask) {
            // Update with complete task data when available
            getTaskStore().updateTaskProgress(
              fullTask.id, 
              fullTask.progress, 
              fullTask.status,
              fullTask.stages
            );
          }
        });
      } catch (error) {
        console.error('Error processing task:created event:', error);
      }
    });
    unlistenFunctions.push(taskCreated);
    
    const taskUpdated = await listen<{ taskId: string, progress: number, status: string }>('task:updated', (event) => {
      if (!event.payload || !event.payload.taskId) return;
      
      console.log(`Task ${event.payload.taskId} progress: ${event.payload.progress}%`);
      
      // Map backend status to frontend TaskStatus
      let taskStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
      
      // Handle core status types
      if (['queued', 'running', 'completed', 'failed', 'cancelled'].includes(event.payload.status)) {
        taskStatus = event.payload.status as any;
      } else {
        // Processing stages all map to 'running' for the overall task status
        taskStatus = 'running';
      }
      
      // Update the task progress in the store
      getTaskStore().updateTaskProgress(
        event.payload.taskId,
        event.payload.progress,
        taskStatus
      );
    });
    unlistenFunctions.push(taskUpdated);
    
    const taskCompleted = await listen<{ taskId: string, result: any }>('task:completed', (event) => {
      if (!event.payload || !event.payload.taskId) return;
      
      console.log('Task completed:', {
        taskId: event.payload.taskId,
        result: event.payload.result
      });
      
      // Update task status to completed
      getTaskStore().updateTaskProgress(
        event.payload.taskId,
        100, // Set progress to 100%
        'completed' as TaskStatus
      );
      
      // Keep completed tasks in UI for 5 seconds before removing them
      setTimeout(() => {
        getTaskStore().removeTask(event.payload.taskId);
      }, 5000);
    });
    unlistenFunctions.push(taskCompleted);
    
    const taskFailed = await listen<{ taskId: string, error: string }>('task:failed', (event) => {
      if (!event.payload) return;
      
      console.error('Task failed:', {
        taskId: event.payload.taskId,
        error: event.payload.error
      });
      
      // Update task status to failed
      getTaskStore().updateTaskProgress(
        event.payload.taskId,
        0, // Reset progress
        'failed' as TaskStatus
      );
      
      // Only show toast for critical errors, not individual task failures
      // which would be too noisy with many tasks
      
      // Keep failed tasks for 10 seconds so user can see the failure
      setTimeout(() => {
        getTaskStore().removeTask(event.payload.taskId);
      }, 10000);
    });
    unlistenFunctions.push(taskFailed);
    
    const taskError = await listen<{ taskId: string, error: string }>('task:error', (event) => {
      if (!event.payload) return;
      
      console.error('Task error:', {
        taskId: event.payload.taskId,
        error: event.payload.error
      });
      
      // Update task status to failed
      getTaskStore().updateTaskProgress(
        event.payload.taskId,
        0, // Reset progress
        'failed' as TaskStatus
      );
      
      // No toast for individual task errors - too noisy with many tasks
      
      // Keep error tasks for 10 seconds so user can see the error
      setTimeout(() => {
        getTaskStore().removeTask(event.payload.taskId);
      }, 10000);
    });
    unlistenFunctions.push(taskError);
    
    const taskCancelled = await listen<{ taskId: string }>('task:cancelled', (event) => {
      if (!event.payload || !event.payload.taskId) return;
      
      console.log('Task cancelled:', event.payload.taskId);
      
      // Remove the task from the store
      getTaskStore().removeTask(event.payload.taskId);
    });
    unlistenFunctions.push(taskCancelled);
    
    // URL Status Events
    const urlStatusUpdated = await listen<{ urlId: string, status: string }>('url:status:updated', (event) => {
      if (!event.payload || !event.payload.urlId) return;
      
      console.log(`URL ${event.payload.urlId} status: ${event.payload.status}`);
      
      // Update URL status in the store
      if (event.payload.status) {
        getUrlStore().updateUrlStatus(event.payload.urlId, event.payload.status as any);
      }
    });
    unlistenFunctions.push(urlStatusUpdated);
    
    // Technology Events
    const techCreated = await listen<{ techId: string, name: string }>('tech:created', (event) => {
      console.log('Technology created:', event.payload);
      
      // Refresh the technologies list
      getTechStore().fetchTechnologies();
    });
    unlistenFunctions.push(techCreated);
    
    const techUpdated = await listen<{ techId: string, data: any }>('tech:updated', (event) => {
      console.log('Technology updated:', event.payload);
      
      // Refresh the technologies list
      getTechStore().fetchTechnologies();
    });
    unlistenFunctions.push(techUpdated);
    
    const techDeleted = await listen<{ techId: string }>('tech:deleted', (event) => {
      console.log('Technology deleted:', event.payload.techId);
      
      // Refresh the technologies list
      getTechStore().fetchTechnologies();
    });
    unlistenFunctions.push(techDeleted);
    
    const techVersionAdded = await listen<{ techId: string, versionId: string, version: string }>('tech:version:added', (event) => {
      console.log('Version added:', event.payload);
      
      // If this is for the current technology, refresh versions
      const selectedTech = getTechStore().selectedTechnology;
      if (selectedTech && selectedTech.id === event.payload.techId) {
        getTechStore().fetchVersions(event.payload.techId);
      }
    });
    unlistenFunctions.push(techVersionAdded);
    
    const techVersionDeleted = await listen<{ techId: string, versionId: string }>('tech:version:deleted', (event) => {
      console.log('Version deleted:', event.payload);
      
      // If this is for the current technology, refresh versions
      const selectedTech = getTechStore().selectedTechnology;
      if (selectedTech && selectedTech.id === event.payload.techId) {
        getTechStore().fetchVersions(event.payload.techId);
      }
    });
    unlistenFunctions.push(techVersionDeleted);
    
    // Processing Events
    const processingStarted = await listen<{ taskId: string, url?: string, techId?: string }>('processing:started', (event) => {
      console.log('Processing started:', event.payload);
      // Remove toast notification for individual tasks
    });
    unlistenFunctions.push(processingStarted);
    
    const processingProgress = await listen<{ taskId: string, stage: string, progress: number }>('processing:progress', (event) => {
      console.log(`Processing ${event.payload.taskId} - ${event.payload.stage}: ${event.payload.progress}%`);
      
      // Update task with additional stage information
      if (event.payload && event.payload.taskId) {
        const tasks = getTaskStore().tasks;
        const task = tasks.find(t => t.id === event.payload.taskId);
        
        if (task) {
          const updatedStages = task.stages || [];
          const stageIndex = updatedStages.findIndex(s => s.name === event.payload.stage);
          
          // Map progress to status
          let stageStatus: 'idle' | 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
          if (event.payload.progress === 0) stageStatus = 'pending';
          else if (event.payload.progress === 100) stageStatus = 'completed';
          else stageStatus = 'active';
          
          if (stageIndex >= 0) {
            // Update existing stage
            updatedStages[stageIndex] = {
              ...updatedStages[stageIndex],
              progress: event.payload.progress,
              status: stageStatus
            };
          } else {
            // Add new stage
            updatedStages.push({
              id: `${task.id}-${event.payload.stage}`,
              name: event.payload.stage,
              progress: event.payload.progress,
              status: stageStatus
            });
          }
          
          // Create updated task with new stages
          const updatedTask = {
            ...task,
            stages: updatedStages
          };
          
          // Find the overall progress by averaging all stages
          const totalProgress = updatedStages.length > 0 
            ? Math.round(updatedStages.reduce((sum, stage) => sum + stage.progress, 0) / updatedStages.length)
            : task.progress;
          
          // Update task with new stages and progress
          getTaskStore().updateTaskProgress(
            task.id,
            totalProgress,
            task.status,
            updatedStages
          );
        }
      }
    });
    unlistenFunctions.push(processingProgress);
    
    const processingCompleted = await listen<{ taskId: string, snippetsCount: number }>('processing:completed', (event) => {
      console.log(`Processing completed with ${event.payload.snippetsCount} snippets`);
      
      // No toast for individual task completion - too noisy with many tasks
    });
    unlistenFunctions.push(processingCompleted);
    
    // Application Notifications - ALWAYS SHOW AS TOASTS
    const appError = await listen<{ code: string, message: string, details?: any }>('app:error', (event) => {
      console.error('Application error:', event.payload);
      
      // Show error toast notification
      toast.error('Error', {
        description: event.payload.message || 'An error occurred',
        action: event.payload.details ? {
          label: 'Details',
          onClick: () => console.log('Error details:', event.payload.details),
        } : undefined,
      });
    });
    unlistenFunctions.push(appError);
    
    const appNotification = await listen<{ title: string, message: string, notificationType?: string }>('app:notification', (event) => {
      console.log(`${event.payload.title}: ${event.payload.message}`);
      
      // Determine toast type based on notificationType
      const notificationType = event.payload.notificationType || 'info';
      
      switch (notificationType) {
        case 'success':
          toast.success(event.payload.title, { description: event.payload.message });
          break;
        case 'warning':
          toast.warning(event.payload.title, { description: event.payload.message });
          break;
        case 'error':
          toast.error(event.payload.title, { description: event.payload.message });
          break;
        case 'info':
        default:
          toast.info(event.payload.title, { description: event.payload.message });
          break;
      }
    });
    unlistenFunctions.push(appNotification);
    
    console.log('All event listeners set up successfully');
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }
}

/**
 * Clean up all event listeners to prevent memory leaks
 */
export async function cleanupEventListeners() {
  try {
    for (const unlisten of unlistenFunctions) {
      await unlisten();
    }
    unlistenFunctions.length = 0;
    console.log('All event listeners cleaned up');
  } catch (error) {
    console.error('Error cleaning up event listeners:', error);
  }
}