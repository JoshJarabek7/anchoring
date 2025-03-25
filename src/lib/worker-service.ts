/**
 * WorkerService - Manages the Web Worker lifecycle and communication
 * Handles offloading event processing and state calculations from the main thread
 */
export class WorkerService {
  private worker: Worker | null = null;
  private callbacks = new Map();
  private initialized = false;
  
  constructor() {
    // Worker initialization is now explicit via initializeWorker()
  }
  
  /**
   * Initialize the web worker
   */
  public initWorker() {
    if (this.initialized) {
      console.log('Worker already initialized');
      return;
    }
    
    try {
      this.worker = new Worker(new URL('../workers/event-worker.ts', import.meta.url), { type: 'module' });
      this.initialized = true;
      
      this.worker.onmessage = (event) => {
        const { type, payload, id } = event.data;
        
        // Execute registered callback if there is one
        if (id && this.callbacks.has(id)) {
          this.callbacks.get(id)(payload);
          this.callbacks.delete(id);
        }
        
        // Handle global message types
        switch (type) {
          case 'TASKS_PROCESSED':
            // This would typically be handled by a callback
            console.log('Tasks processed by worker:', payload.length);
            break;
          
          case 'EVENTS_PROCESSED':
            console.log('Events processed by worker:', payload.length);
            break;
        }
      };
      
      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.restartWorker();
      };
      
      console.log('Worker initialized successfully');
    } catch (err) {
      console.error('Failed to initialize worker:', err);
      this.initialized = false;
    }
  }
  
  /**
   * Restart the worker if it crashes
   */
  private restartWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.initialized = false;
    
    setTimeout(() => {
      console.log('Restarting worker after error');
      this.initWorker();
    }, 1000);
  }
  
  /**
   * Send a message to the worker
   * @param type Message type
   * @param payload Message data
   * @param callback Optional callback when worker responds
   * @returns A promise that resolves when the worker responds
   */
  sendMessage<T = any, R = any>(type: string, payload: T, callback?: (result: R) => void): Promise<R> {
    return new Promise((resolve, reject) => {
      // Check if worker has been initialized
      if (!this.initialized || !this.worker) {
        console.warn(`Worker not initialized when trying to send ${type} message`);
        // Initialize worker if needed
        if (!this.initialized) {
          this.initWorker();
          // If initialization failed, reject the promise
          if (!this.initialized) {
            reject(new Error('Worker not initialized'));
            return;
          }
        }
      }
      
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
      
      const handleResponse = (result: R) => {
        if (callback) {
          callback(result);
        }
        resolve(result);
      };
      
      this.callbacks.set(id, handleResponse);
      this.worker!.postMessage({ type, payload, id });
    });
  }
  
  /**
   * Terminate the worker when the app is closing
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.initialized = false;
  }
  
  /**
   * Check if worker is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.worker !== null;
  }
}

// Export singleton instance
export const workerService = new WorkerService();

/**
 * Initialize the worker service explicitly
 */
export function initializeWorker() {
  workerService.initWorker();
}