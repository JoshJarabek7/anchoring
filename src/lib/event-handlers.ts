import { TaskStatus, useTaskStore } from '@/stores/task-store';
import { useTechnologyStore } from '@/stores/technology-store';
import { useUrlStore } from '@/stores/url-store';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { workerService } from './worker-service';

// Create unlisten functions holder to properly clean up listeners
// Type is correct for Tauri v2 unlisten functions
const unlistenFunctions: Array<() => void> = [];

// Event buffering for batch processing
interface BufferedEvent {
  type: string;
  payload: any;
}

let eventBuffer: BufferedEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const BUFFER_FLUSH_INTERVAL = 50; // ms

/**
 * Flush buffered events to the worker for batch processing
 */
function flushEventBuffer() {
  if (eventBuffer.length === 0) return;
  
  // Clone the buffer and clear it
  const eventsToProcess = [...eventBuffer];
  eventBuffer = [];
  
  // Send to worker for processing
  workerService.sendMessage('PROCESS_EVENTS', { events: eventsToProcess }, (processedEvents) => {
    // Process the optimized events
    processedEvents.forEach(event => {
      const { type } = event;
      
      // Apply state updates based on event type
      if (type.startsWith('task:')) {
        handleTaskEvent(event);
      } else if (type.startsWith('url:')) {
        handleUrlEvent(event);
      } else if (type.startsWith('tech:')) {
        handleTechEvent(event);
      } else if (type.startsWith('processing:')) {
        handleProcessingEvent(event);
      }
    });
  });
}

/**
 * Add event to buffer and schedule flush
 */
function bufferEvent(type: string, payload: any) {
  eventBuffer.push({ type, payload });
  
  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushEventBuffer();
      flushTimeout = null;
    }, BUFFER_FLUSH_INTERVAL);
  }
  
  // If buffer gets too large, flush immediately
  if (eventBuffer.length > 100) {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    flushEventBuffer();
  }
}

/**
 * Handle task events (processed by worker)
 */
function handleTaskEvent(event: any) {
  const { taskId, status, progress, stages } = event;
  if (!taskId) return;
  
  const taskStore = useTaskStore.getState();
  
  // Apply appropriate action based on event subtype
  if (event.type === 'task:created') {
    // Add new task
    const minimalTask = {
      id: taskId,
      taskType: event.taskType,
      status: 'queued' as TaskStatus,
      progress: 0,
      payload: event.metadata,
      createdAt: new Date().toISOString(),
      createdDate: new Date()
    };
    taskStore.addTask(minimalTask);
  } else if (event.type === 'task:updated') {
    // Update task progress - ensure we're using the right status value
    const taskStatus = status || 'running';
    taskStore.updateTaskProgress(taskId, progress, taskStatus as TaskStatus, stages);
  } else if (event.type === 'task:completed') {
    // Mark task as completed with 100% progress
    taskStore.updateTaskProgress(taskId, 100, 'completed', stages);
  } else if (event.type === 'task:failed' || event.type === 'task:error') {
    // Mark task as failed with current progress
    taskStore.updateTaskProgress(taskId, progress || 0, 'failed', stages);
  } else if (event.type === 'task:cancelled') {
    // Mark task as cancelled with current progress
    taskStore.updateTaskProgress(taskId, progress || 0, 'cancelled', stages);
  }
}

/**
 * Handle URL events (processed by worker)
 */
function handleUrlEvent(event: any) {
  const { urlId, status } = event;
  if (!urlId || !status) return;
  
  // Update URL status
  useUrlStore.getState().updateUrlStatus(urlId, status as any);
}

/**
 * Handle technology events (processed by worker)
 */
function handleTechEvent(event: any) {
  const { techId, versionId } = event;
  const techStore = useTechnologyStore.getState();
  
  if (event.type === 'tech:created' || event.type === 'tech:updated' || event.type === 'tech:deleted') {
    // Refresh technologies list
    techStore.fetchTechnologies();
  } else if (event.type === 'tech:version:added' || event.type === 'tech:version:deleted') {
    // If this is for the current technology, refresh versions
    const selectedTech = techStore.selectedTechnology;
    if (selectedTech && selectedTech.id === techId) {
      techStore.fetchVersions(techId);
    }
  }
}

/**
 * Handle processing events (processed by worker)
 */
function handleProcessingEvent(event: any) {
  const { taskId, stage, progress } = event;
  if (!taskId) return;
  
  // For progress events, update task with stage information
  if (event.type === 'processing:progress' && stage) {
    const taskStore = useTaskStore.getState();
    const tasks = taskStore.tasks;
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
      // Use worker to calculate progress
      workerService.sendMessage('CALCULATE_PROGRESS', { task }, (result) => {
        // Update task with optimized stages and progress
        taskStore.updateTaskProgress(
          taskId, 
          result.progress, 
          result.status as TaskStatus,
          task.stages // Keep existing stages
        );
      });
    }
  }
}

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
    
    // Task Events - Use worker for better performance
    const taskCreated = await listen<{ taskId: string, taskType: string, metadata: string }>('task:created', (event) => {
      try {
        if (!event.payload || !event.payload.taskId) return;
        
        const taskId = event.payload.taskId;
        if (processedTaskIds.has(taskId)) {
          console.log(`⚠️ Task ${taskId} already processed, skipping duplicate event`);
          return;
        }
        
        // Mark this task ID as processed
        processedTaskIds.add(taskId);
        
        // Parse metadata if it's a string
        const metadata = typeof event.payload.metadata === 'string' 
          ? JSON.parse(event.payload.metadata) 
          : event.payload.metadata;
        
        // Only log task creation for certain task types to reduce noise
        if (event.payload.taskType === 'crawl_url') {
          console.log(`📋 TASK CREATED: ${event.payload.taskType} - ${taskId.substring(0, 8)}...`);
        }
        
        // Use buffer and worker for optimal state updates
        bufferEvent('task:created', {
          taskId,
          taskType: event.payload.taskType,
          metadata,
        });
        
        // Still add minimal task immediately to show responsiveness in the UI
        const minimalTask = {
          id: taskId,
          taskType: event.payload.taskType,
          status: 'queued' as TaskStatus,
          progress: 0,
          payload: metadata,
          createdAt: new Date().toISOString(),
          createdDate: new Date()
        };
        getTaskStore().addTask(minimalTask);
        
        // Fetch full task data in background
        getTaskStore().getTask(taskId).then(fullTask => {
          if (fullTask) {
            // Use worker to process task data efficiently
            workerService.sendMessage('PROCESS_TASKS', { tasks: [fullTask] }, (processedTasks) => {
              if (processedTasks && processedTasks[0]) {
                const processed = processedTasks[0];
                getTaskStore().updateTaskProgress(
                  processed.id, 
                  processed.progress, 
                  processed.status,
                  processed.stages
                );
              }
            });
          }
        });
      } catch (error) {
        console.error('Error processing task:created event:', error);
      }
    });
    unlistenFunctions.push(taskCreated);
    
    const taskUpdated = await listen<{ taskId: string, progress: number, status: string }>('task:updated', (event) => {
      if (!event.payload || !event.payload.taskId) return;
      
      // Only log significant progress updates to reduce noise
      const progress = event.payload.progress;
      if (progress === 0 || progress === 50 || progress === 100) {
        console.log(`📊 TASK ${event.payload.taskId.substring(0, 8)}... progress: ${progress}%`);
      }
      
      // Buffer the event for batch processing
      bufferEvent('task:updated', {
        taskId: event.payload.taskId,
        progress: event.payload.progress,
        status: event.payload.status
      });
      
      // Apply update directly as well, for immediate UI feedback
      getTaskStore().updateTaskProgress(
        event.payload.taskId,
        event.payload.progress,
        event.payload.status as TaskStatus
      );
    });
    unlistenFunctions.push(taskUpdated);
    
    const taskCompleted = await listen<{ taskId: string, result: any }>('task:completed', (event) => {
      if (!event.payload || !event.payload.taskId) return;
      
      console.log('✅ TASK COMPLETED:', {
        taskId: event.payload.taskId.substring(0, 8) + '...',
        result: event.payload.result
      });
      
      // Buffer the event for batch processing
      bufferEvent('task:completed', {
        taskId: event.payload.taskId,
        result: event.payload.result
      });
    });
    unlistenFunctions.push(taskCompleted);
    
    const taskFailed = await listen<{ taskId: string, error: string }>('task:failed', (event) => {
      if (!event.payload) return;
      
      console.error('❌ TASK FAILED:', {
        taskId: event.payload.taskId.substring(0, 8) + '...',
        error: event.payload.error
      });
      
      // Buffer the event for batch processing
      bufferEvent('task:failed', {
        taskId: event.payload.taskId,
        error: event.payload.error
      });
    });
    unlistenFunctions.push(taskFailed);
    
    const taskError = await listen<{ taskId: string, error: string }>('task:error', (event) => {
      if (!event.payload) return;
      
      console.error('⛔ TASK ERROR:', {
        taskId: event.payload.taskId.substring(0, 8) + '...',
        error: event.payload.error
      });
      
      // Buffer the event for batch processing
      bufferEvent('task:error', {
        taskId: event.payload.taskId,
        error: event.payload.error
      });
    });
    unlistenFunctions.push(taskError);
    
    const taskCancelled = await listen<{ taskId: string }>('task:cancelled', (event) => {
      if (!event.payload || !event.payload.taskId) return;
      
      console.log('🚫 TASK CANCELLED:', event.payload.taskId.substring(0, 8) + '...');
      
      // Buffer the event for batch processing
      bufferEvent('task:cancelled', {
        taskId: event.payload.taskId
      });
    });
    unlistenFunctions.push(taskCancelled);
    
    // URL Status Events - Use batch processing for performance
    let pendingUrlUpdates: { urlId: string, status: string }[] = [];
    let urlUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    
    const urlStatusUpdated = await listen<{ urlId: string, status: string }>('url:status:updated', (event) => {
      if (!event.payload || !event.payload.urlId) return;
      
      // Collect URL updates for batch processing
      pendingUrlUpdates.push({
        urlId: event.payload.urlId,
        status: event.payload.status
      });
      
      // Debounce updates to reduce UI load
      if (!urlUpdateTimer) {
        urlUpdateTimer = setTimeout(() => {
          // Process URL updates in batches using worker
          if (pendingUrlUpdates.length > 0) {
            workerService.sendMessage('BATCH_URL_UPDATES', { updates: pendingUrlUpdates }, (processedUpdates) => {
              // Update URLs in store
              processedUpdates.forEach(update => {
                getUrlStore().updateUrlStatus(update.urlId, update.status as any);
              });
            });
            
            pendingUrlUpdates = [];
          }
          urlUpdateTimer = null;
        }, 100); // Process URL updates less frequently than tasks
      }
    });
    unlistenFunctions.push(urlStatusUpdated);
    
    // Technology Events - Buffer and batch with worker
    const techCreated = await listen<{ techId: string, name: string }>('tech:created', (event) => {
      console.log('Technology created:', event.payload);
      
      // Buffer event for processing
      bufferEvent('tech:created', {
        techId: event.payload.techId,
        name: event.payload.name
      });
      
      // Still trigger an immediate fetch for responsiveness
      getTechStore().fetchTechnologies();
    });
    unlistenFunctions.push(techCreated);
    
    const techUpdated = await listen<{ techId: string, data: any }>('tech:updated', (event) => {
      console.log('Technology updated:', event.payload);
      
      // Buffer event for processing
      bufferEvent('tech:updated', {
        techId: event.payload.techId,
        data: event.payload.data
      });
      
      // Still trigger an immediate fetch for responsiveness
      getTechStore().fetchTechnologies();
    });
    unlistenFunctions.push(techUpdated);
    
    const techDeleted = await listen<{ techId: string }>('tech:deleted', (event) => {
      console.log('Technology deleted:', event.payload.techId);
      
      // Buffer event for processing
      bufferEvent('tech:deleted', {
        techId: event.payload.techId
      });
      
      // Still trigger an immediate fetch for responsiveness
      getTechStore().fetchTechnologies();
    });
    unlistenFunctions.push(techDeleted);
    
    const techVersionAdded = await listen<{ techId: string, versionId: string, version: string }>('tech:version:added', (event) => {
      console.log('Version added:', event.payload);
      
      // Buffer event for processing
      bufferEvent('tech:version:added', {
        techId: event.payload.techId,
        versionId: event.payload.versionId,
        version: event.payload.version
      });
      
      // If this is for the current technology, refresh versions
      const selectedTech = getTechStore().selectedTechnology;
      if (selectedTech && selectedTech.id === event.payload.techId) {
        getTechStore().fetchVersions(event.payload.techId);
      }
    });
    unlistenFunctions.push(techVersionAdded);
    
    const techVersionDeleted = await listen<{ techId: string, versionId: string }>('tech:version:deleted', (event) => {
      console.log('Version deleted:', event.payload);
      
      // Buffer event for processing
      bufferEvent('tech:version:deleted', {
        techId: event.payload.techId,
        versionId: event.payload.versionId
      });
      
      // If this is for the current technology, refresh versions
      const selectedTech = getTechStore().selectedTechnology;
      if (selectedTech && selectedTech.id === event.payload.techId) {
        getTechStore().fetchVersions(event.payload.techId);
      }
    });
    unlistenFunctions.push(techVersionDeleted);
    
    // Processing Events - offload to worker
    const processingStarted = await listen<{ taskId: string, url?: string, techId?: string }>('processing:started', (event) => {
      console.log('Processing started:', event.payload);
      
      // Buffer event for processing
      bufferEvent('processing:started', {
        taskId: event.payload.taskId,
        url: event.payload.url,
        techId: event.payload.techId
      });
    });
    unlistenFunctions.push(processingStarted);
    
    const processingProgress = await listen<{ taskId: string, stage: string, progress: number }>('processing:progress', (event) => {
      // Buffer event for batch processing
      bufferEvent('processing:progress', {
        taskId: event.payload.taskId,
        stage: event.payload.stage,
        progress: event.payload.progress
      });
      
      // For visibility, still log significant progress updates
      if (event.payload.progress === 0 || event.payload.progress === 100) {
        console.log(`Processing ${event.payload.taskId} - ${event.payload.stage}: ${event.payload.progress}%`);
      }
      
      // Get the task and update its stages - but use worker for calculations
      const taskId = event.payload.taskId;
      const stage = event.payload.stage;
      const progress = event.payload.progress;
      
      if (taskId && stage) {
        const tasks = getTaskStore().tasks;
        const task = tasks.find(t => t.id === taskId);
        
        if (task) {
          // Create a copy of stages
          const updatedStages = [...(task.stages || [])];
          const stageIndex = updatedStages.findIndex(s => s.name === stage);
          
          // Map progress to status
          let stageStatus: 'idle' | 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
          if (progress === 0) stageStatus = 'pending';
          else if (progress === 100) stageStatus = 'completed';
          else stageStatus = 'active';
          
          if (stageIndex >= 0) {
            // Update existing stage
            updatedStages[stageIndex] = {
              ...updatedStages[stageIndex],
              progress: progress,
              status: stageStatus
            };
          } else {
            // Add new stage
            updatedStages.push({
              id: `${task.id}-${stage}`,
              name: stage,
              progress: progress,
              status: stageStatus
            });
          }
          
          // Update task with new stages, but let worker calculate overall progress
          const updatedTask = {
            ...task,
            stages: updatedStages
          };
          
          // Use worker to calculate progress efficiently
          workerService.sendMessage('CALCULATE_PROGRESS', { task: updatedTask }, (result) => {
            getTaskStore().updateTaskProgress(
              taskId,
              result.progress,
              result.status as TaskStatus,
              updatedStages
            );
          });
        }
      }
    });
    unlistenFunctions.push(processingProgress);
    
    const processingCompleted = await listen<{ taskId: string, snippetsCount: number }>('processing:completed', (event) => {
      console.log(`Processing completed with ${event.payload.snippetsCount} snippets`);
      
      // Buffer event for batch processing
      bufferEvent('processing:completed', {
        taskId: event.payload.taskId,
        snippetsCount: event.payload.snippetsCount
      });
    });
    unlistenFunctions.push(processingCompleted);
    
    // App Notifications - Controlled via settings
    const appNotification = await listen<{ title: string, message: string, notificationType?: string }>('app:notification', (event) => {
      if (!event.payload) return;
      
      const { title, message, notificationType } = event.payload;
      
      // Filter out unnecessary notifications related to URL crawling
      if (title.includes("Crawling") && 
          ((!title.includes("Started") && !title.includes("Completed")) || 
           (title.includes("Started") && message.includes("Started crawling from URL:")))) {
        // Just log to console instead of showing a toast
        console.log(`${title}: ${message}`);
        return;
      }
      
      // Show only important notifications as toasts
      switch (notificationType) {
        case 'error':
          toast.error(title, { description: message });
          break;
        case 'warning':
          toast.warning(title, { description: message });
          break;
        case 'info':
          // Only show info notifications if they're important (not routine operations)
          if (!title.includes("URL") || title.includes("All URLs")) {
            toast.info(title, { description: message });
          } else {
            console.log(`[INFO] ${title}: ${message}`);
          }
          break;
        case 'success':
          // Only show success notifications for completed operations, not intermediate steps
          if (title.includes("Completed") || title.includes("Finished")) {
            toast.success(title, { description: message });
          } else {
            console.log(`[SUCCESS] ${title}: ${message}`);
          }
          break;
        default:
          // Default notifications - only show if they seem important
          if (title.includes("Error") || title.includes("Failed")) {
            toast.error(title, { description: message });
          } else if (title.includes("Completed") || title.includes("Finished")) {
            toast.success(title, { description: message });
          } else {
            console.log(`[NOTIFICATION] ${title}: ${message}`);
          }
          break;
      }
    });
    unlistenFunctions.push(appNotification);
    
    console.log('All event listeners set up successfully');
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }
}