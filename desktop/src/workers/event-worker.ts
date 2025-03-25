/**
 * Web Worker for Anchoring app
 * Handles event processing and state calculations off the main thread
 */

// TypeScript interfaces to match app types
interface Task {
  id: string;
  taskType: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  payload: any;
  stages?: TaskStage[];
  createdAt: string;
  createdDate: Date;
}

interface TaskStage {
  id: string;
  name: string;
  progress: number;
  status: 'idle' | 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
}

interface AppEvent {
  type: string;
  taskId?: string;
  urlId?: string;
  techId?: string;
  versionId?: string;
  progress?: number;
  status?: string;
  stage?: string;
  [key: string]: any;
}

// Handle messages from main thread
self.onmessage = (event) => {
  const { type, payload, id } = event.data;
  
  try {
    switch (type) {
      case 'PROCESS_TASKS':
        // Process tasks in batch and apply calculations
        const processedTasks = batchProcessTasks(payload.tasks);
        self.postMessage({ type: 'TASKS_PROCESSED', payload: processedTasks, id });
        break;
        
      case 'PROCESS_EVENTS':
        // Process multiple events efficiently
        const result = processEvents(payload.events);
        self.postMessage({ type: 'EVENTS_PROCESSED', payload: result, id });
        break;
        
      case 'CALCULATE_PROGRESS':
        // Calculate aggregated progress from task stages
        const progress = calculateTaskProgress(payload.task);
        self.postMessage({ type: 'PROGRESS_CALCULATED', payload: progress, id });
        break;
        
      case 'BATCH_URL_UPDATES':
        // Process URL status updates
        const updatedUrls = processUrlUpdates(payload.updates);
        self.postMessage({ type: 'URL_UPDATES_PROCESSED', payload: updatedUrls, id });
        break;
      
      default:
        console.error('Unknown message type:', type);
        self.postMessage({ 
          type: 'ERROR', 
          payload: { error: `Unknown message type: ${type}` }, 
          id 
        });
    }
  } catch (error) {
    console.error('Worker error processing message:', error);
    self.postMessage({ 
      type: 'ERROR', 
      payload: { error: error instanceof Error ? error.message : 'Unknown error' }, 
      id 
    });
  }
};

/**
 * Process multiple tasks in a batch
 * - Calculates progress
 * - Processes stages
 * - Optimizes updates
 */
function batchProcessTasks(tasks: Task[]): Task[] {
  // Process each task
  return tasks.map(task => {
    // Skip tasks that don't need updates
    if (!task) return task;
    
    // Deep clone to avoid mutations
    const updatedTask = JSON.parse(JSON.stringify(task));
    
    // Calculate progress if task has stages
    if (updatedTask.stages && updatedTask.stages.length > 0) {
      const totalProgress = Math.round(
        updatedTask.stages.reduce((sum, stage) => sum + stage.progress, 0) / 
        updatedTask.stages.length
      );
      updatedTask.progress = totalProgress;
    }
    
    return updatedTask;
  });
}

/**
 * Process multiple events efficiently
 * - Batches similar events
 * - Optimizes state updates
 */
function processEvents(events: AppEvent[]): AppEvent[] {
  // Create map to consolidate events by task/url ID
  const taskEventMap = new Map<string, AppEvent>();
  const urlEventMap = new Map<string, AppEvent>();
  const techEventMap = new Map<string, AppEvent>();
  const otherEvents: AppEvent[] = [];
  
  // Group events by type and ID
  for (const event of events) {
    if (event.taskId && event.type.startsWith('task:')) {
      // Only keep latest event for each task
      taskEventMap.set(event.taskId, event);
    } else if (event.urlId && event.type.startsWith('url:')) {
      // Only keep latest event for each URL
      urlEventMap.set(event.urlId, event);
    } else if (event.techId && event.type.startsWith('tech:')) {
      // Only keep latest event for each technology
      techEventMap.set(event.techId, event);
    } else {
      // Keep other events as-is
      otherEvents.push(event);
    }
  }
  
  // Combine all events
  const processedEvents = [
    ...Array.from(taskEventMap.values()),
    ...Array.from(urlEventMap.values()),
    ...Array.from(techEventMap.values()),
    ...otherEvents
  ];
  
  return processedEvents;
}

/**
 * Calculate task progress from stages
 */
function calculateTaskProgress(task: Task): { progress: number, status: string } {
  if (!task.stages || task.stages.length === 0) {
    return { progress: task.progress, status: task.status };
  }
  
  // Calculate average progress from stages
  const totalProgress = Math.round(
    task.stages.reduce((sum, stage) => sum + stage.progress, 0) / 
    task.stages.length
  );
  
  // Determine status from stages
  let status = task.status;
  
  // If any stage is failed, set status to failed
  if (task.stages.some(stage => stage.status === 'failed')) {
    status = 'failed';
  } 
  // If all stages are completed, set status to completed
  else if (task.stages.every(stage => stage.status === 'completed')) {
    status = 'completed';
  }
  // If any stage is active, set status to running
  else if (task.stages.some(stage => stage.status === 'active')) {
    status = 'running';
  }
  
  return { progress: totalProgress, status };
}

/**
 * Process URL status updates in batch
 */
function processUrlUpdates(updates: { urlId: string, status: string }[]): { urlId: string, status: string }[] {
  // Deduplicate updates by URL ID (keep the latest)
  const urlMap = new Map<string, { urlId: string, status: string }>();
  
  for (const update of updates) {
    urlMap.set(update.urlId, update);
  }
  
  return Array.from(urlMap.values());
}