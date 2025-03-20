// Expose our service modules
pub mod browser;
pub mod crawler;
pub mod documentation;
pub mod documentation_url_service;
pub mod events;
pub mod intelligence;
pub mod proxies;
pub mod technology_service;
pub mod version_service;

// Convenience re-exports
pub use browser::BrowserService;
pub use crawler::CrawlerService;
pub use documentation::DocumentationService;
pub use documentation_url_service::DocumentationUrlService;
use events::TaskCompletedResult;
pub use events::{EventEmitter, TaskPayload};
pub use intelligence::IntelligenceService;
pub use proxies::ProxyService;
pub use technology_service::TechnologyService;
pub use version_service::VersionService;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use tauri::AppHandle;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Technical information about a technology being processed
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechnicalInfo {
    pub name: String,
    pub version: Option<String>,
    pub related_technologies: Option<Vec<String>>,
}

/// Task status for tracking progress
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Task definition for the global task queue
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub task_type: String,
    pub status: TaskStatus,
    pub progress: i32,
    pub technology_id: Option<Uuid>,
    pub version_id: Option<Uuid>,
    pub payload: TaskPayload,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Internal representation of a task with its status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskWithStatus {
    task: Task,
    status: TaskStatus,
}

impl Task {
    pub fn new(
        task_type: &str,
        technology_id: Option<Uuid>,
        version_id: Option<Uuid>,
        payload: TaskPayload,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            task_type: task_type.to_string(),
            status: TaskStatus::Queued,
            progress: 0,
            technology_id,
            version_id,
            payload,
            created_at: chrono::Utc::now(),
        }
    }
}

/// Worker pool for executing tasks in the background
#[derive(Debug)]
pub struct WorkerPool {
    workers: Vec<tauri::async_runtime::JoinHandle<()>>,
    sender: mpsc::Sender<Task>,
    active_tasks: Arc<RwLock<HashMap<String, Task>>>,
    cancellation_flags: Arc<RwLock<HashMap<String, Arc<Mutex<bool>>>>>,
    event_emitter: Arc<EventEmitter>,
    app_handle: AppHandle,
}

impl WorkerPool {
    pub fn new(app_handle: AppHandle, event_emitter: Arc<EventEmitter>) -> Self {
        let (sender, receiver) = mpsc::channel::<Task>(100);
        let active_tasks = Arc::new(RwLock::new(HashMap::<String, Task>::new()));
        let cancellation_flags = Arc::new(RwLock::new(HashMap::<String, Arc<Mutex<bool>>>::new()));

        // Wrap the receiver in Arc<Mutex<>> for shared access
        let receiver = Arc::new(tokio::sync::Mutex::new(receiver));

        // Determine number of workers based on CPU cores
        let num_cores = std::thread::available_parallelism()
            .map(NonZeroUsize::get)
            .unwrap_or(1);

        let mut workers = Vec::with_capacity(num_cores);

        // Create worker tasks
        for worker_id in 0..num_cores {
            // Create a new channel for each worker
            let worker_sender = sender.clone();
            let worker_receiver = receiver.clone();
            let worker_event_emitter = event_emitter.clone();
            let worker_active_tasks = active_tasks.clone();
            let worker_cancellation_flags = cancellation_flags.clone();
            let worker_app_handle = app_handle.clone();

            let handle = tauri::async_runtime::spawn(async move {
                println!("Worker {worker_id} started");

                while let Some(task) = {
                    // Lock the mutex to access the receiver
                    let mut recv = worker_receiver.lock().await;
                    recv.recv().await
                } {
                    // Skip if task is already cancelled before processing
                    if let Some(cancel_flag) =
                        worker_cancellation_flags.read().unwrap().get(&task.id)
                    {
                        if *cancel_flag.lock().unwrap() {
                            println!("Task {} already cancelled, skipping", task.id);
                            continue;
                        }
                    }

                    // Add cancellation flag
                    {
                        worker_cancellation_flags
                            .write()
                            .unwrap()
                            .entry(task.id.clone())
                            .or_insert_with(|| Arc::new(Mutex::new(false)));
                    }

                    // Create a mutable copy of the task with Running status
                    let mut running_task = task.clone();
                    running_task.status = TaskStatus::Running;

                    // Update the active tasks with the running task
                    worker_active_tasks
                        .write()
                        .unwrap()
                        .insert(task.id.clone(), running_task);

                    // Emit event that task has started
                    if let Err(e) =
                        worker_event_emitter.emit_task_updated(&task.id, task.progress, "running")
                    {
                        eprintln!("Error emitting task started event: {}", e);
                    }

                    // Process tasks based on their task_type
                    println!(
                        "Worker {worker_id} processing task {} of type {}",
                        task.id, task.task_type
                    );

                    // Check cancellation flag periodically
                    let should_cancel = || {
                        worker_cancellation_flags
                            .read()
                            .unwrap()
                            .get(&task.id)
                            .map(|flag| *flag.lock().unwrap())
                            .unwrap_or(false)
                    };

                    // Get references to services
                    let services = get_services();

                    // Process task based on its type
                    if !should_cancel() {
                        // Get task parameters from payload
                        match task.task_type.as_str() {
                            "crawl_url" => {
                                // Extract parameters from task payload
                                let url = task.payload.url;
                                let prefix_path = task.payload.prefix_path.as_str();
                                let anti_paths = task.payload.anti_paths;
                                let anti_keywords = task.payload.anti_keywords;
                                let skip_processed = task.payload.skip_processed;

                                // Process the URL
                                if let (Some(tech_id), Some(ver_id)) =
                                    (task.technology_id, task.version_id)
                                {
                                    if let Err(e) = services
                                        .crawler
                                        .process_url_with_links(
                                            &task.id,
                                            tech_id,
                                            ver_id,
                                            &url,
                                            &prefix_path,
                                            &anti_paths,
                                            &anti_keywords,
                                            skip_processed,
                                        )
                                        .await
                                    {
                                        eprintln!("Error processing URL {}: {}", url, e);
                                        if let Err(e) =
                                            worker_event_emitter.emit_task_error(&task.id, &e)
                                        {
                                            eprintln!("Error emitting task error event: {}", e);
                                        }
                                    }
                                }
                            }
                            "clean_markdown" => {
                                // Extract parameters from task payload
                                let url_id = task.payload.url_id;

                                // Only process if we have a valid URL ID

                                // Update task status to processing
                                if let Err(e) = worker_event_emitter.emit_task_updated(
                                    &task.id,
                                    20,
                                    "loading_markdown",
                                ) {
                                    eprintln!("Error updating task progress: {}", e);
                                }

                                // Get the URL from the database
                                match services.documentation_urls.get_url_by_id(url_id).await {
                                    Ok(Some(url_obj)) => {
                                        // Check if the URL has markdown content
                                        if let Some(markdown) = &url_obj.markdown {
                                            // Update progress
                                            if let Err(e) = worker_event_emitter.emit_task_updated(
                                                &task.id,
                                                40,
                                                "cleaning_markdown",
                                            ) {
                                                eprintln!("Error updating task progress: {}", e);
                                            }

                                            // Use the intelligence service to clean markdown
                                            match services
                                                .intelligence
                                                .cleanup_markdown(markdown)
                                                .await
                                            {
                                                Ok(clean_markdown) => {
                                                    // Update progress
                                                    if let Err(e) = worker_event_emitter
                                                        .emit_task_updated(
                                                            &task.id,
                                                            80,
                                                            "saving_cleaned_markdown",
                                                        )
                                                    {
                                                        eprintln!(
                                                            "Error updating task progress: {}",
                                                            e
                                                        );
                                                    }

                                                    // Save cleaned markdown to database
                                                    if let Err(e) = services
                                                        .documentation_urls
                                                        .update_url_cleaned_markdown(
                                                            url_id,
                                                            &clean_markdown,
                                                        )
                                                        .await
                                                    {
                                                        eprintln!(
                                                            "Error saving cleaned markdown: {}",
                                                            e
                                                        );

                                                        // Emit error event
                                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                                                &task.id,
                                                                &format!("Failed to save cleaned markdown: {}", e),
                                                            ) {
                                                                eprintln!("Error emitting task error: {}", e);
                                                            }
                                                    } else {
                                                        // Update URL status
                                                        if let Err(e) = worker_event_emitter
                                                            .emit_url_status_updated(
                                                                &url_id,
                                                                "markdown_cleaned",
                                                            )
                                                        {
                                                            eprintln!("Error emitting URL status update: {}", e);
                                                        }

                                                        // Emit completion event
                                                        if let Err(e) = worker_event_emitter
                                                            .emit_task_completed(
                                                                &task.id,
                                                                TaskCompletedResult {
                                                                    snippets_count: None,
                                                                    url_id: Uuid::nil(),
                                                                },
                                                            )
                                                        {
                                                            eprintln!("Error emitting task completed event: {}", e);
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    eprintln!(
                                                        "Error cleaning markdown for URL {}: {}",
                                                        url_id, e
                                                    );

                                                    // Emit error event
                                                    if let Err(e) = worker_event_emitter
                                                        .emit_task_error(
                                                            &task.id,
                                                            &format!(
                                                                "Failed to clean markdown: {}",
                                                                e
                                                            ),
                                                        )
                                                    {
                                                        eprintln!(
                                                            "Error emitting task error: {}",
                                                            e
                                                        );
                                                    }
                                                }
                                            }
                                        } else {
                                            // No markdown content
                                            eprintln!("URL {} has no markdown content", url_id);

                                            // Emit error event
                                            if let Err(e) = worker_event_emitter.emit_task_error(
                                                &task.id,
                                                &format!("URL {} has no markdown content", url_id),
                                            ) {
                                                eprintln!("Error emitting task error: {}", e);
                                            }
                                        }
                                    }
                                    Ok(None) => {
                                        // URL not found
                                        eprintln!("URL {} not found", url_id);

                                        // Emit error event
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("URL {} not found", url_id),
                                        ) {
                                            eprintln!("Error emitting task error: {}", e);
                                        }
                                    }
                                    Err(e) => {
                                        // Database error
                                        eprintln!("Error getting URL {}: {}", url_id, e);

                                        // Emit error event
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("Database error: {}", e),
                                        ) {
                                            eprintln!("Error emitting task error: {}", e);
                                        }
                                    }
                                }
                            }
                            "generate_snippets" => {
                                // Extract parameters from task payload
                                let url_id = task.payload.url_id;

                                // Only process if we have a valid URL ID

                                // Update task status to processing
                                if let Err(e) = worker_event_emitter.emit_task_updated(
                                    &task.id,
                                    20,
                                    "loading_markdown",
                                ) {
                                    eprintln!("Error updating task progress: {}", e);
                                }

                                // Get the URL from the database
                                match services.documentation_urls.get_url_by_id(url_id).await {
                                    Ok(Some(url_obj)) => {
                                        // Check if the URL has cleaned markdown content
                                        let markdown = match &url_obj.cleaned_markdown {
                                            Some(clean_md) => clean_md,
                                            None => match &url_obj.markdown {
                                                Some(raw_md) => raw_md, // Fall back to raw markdown
                                                None => {
                                                    // No markdown content
                                                    eprintln!(
                                                        "URL {} has no markdown content",
                                                        url_id
                                                    );

                                                    // Emit error event
                                                    if let Err(e) = worker_event_emitter.emit_task_error(
                                                            &task.id,
                                                            &format!("URL {} has no markdown content for AI processing", url_id),
                                                        ) {
                                                            eprintln!("Error emitting task error: {}", e);
                                                        }

                                                    continue;
                                                }
                                            },
                                        };

                                        // Update progress
                                        if let Err(e) = worker_event_emitter.emit_task_updated(
                                            &task.id,
                                            40,
                                            "processing_documentation",
                                        ) {
                                            eprintln!("Error updating task progress: {}", e);
                                        }

                                        // Update progress - preparing to process snippets
                                        if let Err(e) = worker_event_emitter.emit_task_updated(
                                            &task.id,
                                            50,
                                            "preparing_snippets",
                                        ) {
                                            eprintln!("Error updating task progress: {}", e);
                                        }

                                        let (tech, ver) = match get_services()
                                            .documentation_urls
                                            .get_tech_and_version_for_url(url_id)
                                            .await
                                        {
                                            Ok((technology, version)) => (technology, version),
                                            Err(e) => {
                                                eprintln!(
                                                    "Error getting technology and version: {}",
                                                    e
                                                );
                                                if let Err(e) = worker_event_emitter
                                                    .emit_task_error(
                                                        &task.id,
                                                        &format!(
                                                        "Error getting technology and version: {}",
                                                        e
                                                    ),
                                                    )
                                                {
                                                    eprintln!("Error emitting task error: {}", e);
                                                }
                                                continue;
                                            }
                                        };

                                        // Extract tech info from task payload

                                        // Create a DocumentationServiceHelper struct that can emit events
                                        let doc_service_helper = DocumentationServiceHelper {
                                            task_id: task.id.clone(),
                                            url_id,
                                            event_emitter: worker_event_emitter.clone(),
                                        };

                                        // Use the documentation service to process the URL into snippets
                                        // The helper will handle progress updates during processing
                                        let result = services
                                            .documentation
                                            .process_url_to_snippets_with_progress(
                                                url_id,
                                                &tech,
                                                &ver,
                                                Some(&doc_service_helper),
                                            )
                                            .await;

                                        match result {
                                            Ok(snippet_ids) => {
                                                // Emit completion event with snippet count
                                                let task_result = TaskCompletedResult {
                                                    snippets_count: Some(snippet_ids.len()),
                                                    url_id,
                                                };
                                                if let Err(e) = worker_event_emitter
                                                    .emit_task_completed(&task.id, task_result)
                                                {
                                                    eprintln!(
                                                        "Error emitting task completion: {}",
                                                        e
                                                    );
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!(
                                                    "Error generating snippets for URL {}: {}",
                                                    url_id, e
                                                );

                                                // Emit error event
                                                if let Err(e) = worker_event_emitter
                                                    .emit_task_error(
                                                        &task.id,
                                                        &format!(
                                                            "Failed to generate snippets: {}",
                                                            e
                                                        ),
                                                    )
                                                {
                                                    eprintln!("Error emitting task error: {}", e);
                                                }
                                            }
                                        }
                                    }
                                    Ok(None) => {
                                        // URL not found
                                        eprintln!("URL {} not found", url_id);

                                        // Emit error event
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("URL {} not found", url_id),
                                        ) {
                                            eprintln!("Error emitting task error: {}", e);
                                        }
                                    }
                                    Err(e) => {
                                        // Database error
                                        eprintln!("Error getting URL {}: {}", url_id, e);

                                        // Emit error event
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("Database error: {}", e),
                                        ) {
                                            eprintln!("Error emitting task error: {}", e);
                                        }
                                    }
                                }
                            }
                            // Default case for unknown task types
                            _ => {
                                println!("Unknown task type: {}", task.task_type);
                                // Simulate generic work for unknown task types
                                for i in 1..=10 {
                                    if should_cancel() {
                                        break;
                                    }

                                    // Update progress
                                    if let Err(e) = worker_event_emitter.emit_task_updated(
                                        &task.id,
                                        i * 10,
                                        "running",
                                    ) {
                                        eprintln!("Error updating task progress: {}", e);
                                    }

                                    // Simulate work
                                    tokio::time::sleep(tokio::time::Duration::from_millis(100))
                                        .await;
                                }
                            }
                        }
                    }

                    // Check if task was cancelled
                    if should_cancel() {
                        // Emit cancelled event
                        if let Err(e) = worker_event_emitter.emit_task_cancelled(&task.id) {
                            eprintln!("Error emitting task cancelled event: {}", e);
                        }
                    } else {
                        // Emit completed event
                        if let Err(e) = worker_event_emitter.emit_task_completed(
                            &task.id,
                            TaskCompletedResult {
                                snippets_count: None,
                                url_id: Uuid::nil(),
                            },
                        ) {
                            eprintln!("Error emitting task completed event: {}", e);
                        }
                    }

                    // Clean up
                    worker_active_tasks.write().unwrap().remove(&task.id);
                    worker_cancellation_flags.write().unwrap().remove(&task.id);
                }

                println!("Worker {worker_id} shutting down");
            });

            workers.push(handle);
        }

        Self {
            workers,
            sender,
            active_tasks,
            cancellation_flags,
            event_emitter: event_emitter.clone(),
            app_handle: app_handle.clone(),
        }
    }

    /// Queue a task for processing
    pub async fn queue_task(&self, task: Task) -> Result<String, String> {
        // Emit event for task creation
        if let Err(e) =
            self.event_emitter
                .emit_task_created(&task.id, &task.task_type, task.payload.clone())
        {
            eprintln!("Error emitting task created event: {}", e);
        }

        // Send task to worker
        if let Err(_) = self.sender.send(task.clone()).await {
            return Err("Failed to send task to worker".into());
        }

        Ok(task.id.clone())
    }

    /// Cancel a task by ID
    pub fn cancel_task(&self, task_id: &str) -> Result<(), String> {
        // Mark the task as cancelled
        if let Some(cancel_flag) = self.cancellation_flags.read().unwrap().get(task_id) {
            *cancel_flag.lock().unwrap() = true;

            // Update task status in active tasks
            if let Some(mut task) = self.active_tasks.write().unwrap().get_mut(task_id) {
                task.status = TaskStatus::Cancelled;
            }

            Ok(())
        } else {
            Err(format!("Task not found: {}", task_id))
        }
    }

    /// Get the status of a task
    pub fn get_task_status(&self, task_id: &str) -> Option<TaskStatus> {
        self.active_tasks
            .read()
            .unwrap()
            .get(task_id)
            .map(|task| task.status.clone())
    }

    /// Get all active tasks
    pub fn get_active_tasks(&self) -> Vec<Task> {
        self.active_tasks
            .read()
            .unwrap()
            .values()
            .cloned()
            .collect()
    }
}

/// Helper struct for DocumentationService to emit progress events during processing
pub struct DocumentationServiceHelper {
    pub task_id: String,
    pub url_id: Uuid,
    pub event_emitter: Arc<EventEmitter>,
}

impl DocumentationServiceHelper {
    /// Emit a progress update for a snippet generation task
    pub fn emit_progress(&self, progress: i32, status: &str) -> Result<(), String> {
        // Emit task progress update
        if let Err(e) = self
            .event_emitter
            .emit_task_updated(&self.task_id, progress, status)
        {
            eprintln!("Error emitting task progress: {}", e);
            return Err(format!("Error emitting task progress: {}", e));
        }

        // If we're at 100% progress, also update URL status
        if progress == 100 {
            if let Err(e) = self
                .event_emitter
                .emit_url_status_updated(&self.url_id, "snippets_generated")
            {
                eprintln!("Error emitting URL status update: {}", e);
                return Err(format!("Error emitting URL status update: {}", e));
            }
        }

        Ok(())
    }
}

// Service container for easy access to all services
#[derive(Debug)]
pub struct Services {
    pub documentation: DocumentationService,
    pub documentation_urls: DocumentationUrlService,
    pub intelligence: IntelligenceService,
    pub technologies: TechnologyService,
    pub versions: VersionService,
    pub proxies: ProxyService,
    pub browser: BrowserService,
    pub crawler: CrawlerService,
    pub event_emitter: Arc<EventEmitter>,
    pub worker_pool: WorkerPool,
    pub app_handle: AppHandle,
}

impl Services {
    pub fn new(app_handle: AppHandle, event_emitter: Arc<EventEmitter>) -> Self {
        let worker_pool = WorkerPool::new(app_handle.clone(), event_emitter.clone());

        Services {
            documentation: DocumentationService::new(),
            documentation_urls: DocumentationUrlService::new(),
            intelligence: IntelligenceService::new(),
            technologies: TechnologyService::new(),
            versions: VersionService::new(),
            proxies: ProxyService::new(),
            browser: BrowserService::new(),
            crawler: CrawlerService::new(),
            event_emitter: event_emitter.clone(),
            worker_pool,
            app_handle: app_handle.clone(),
        }
    }

    // Initialize service with event emitter - should be called during app setup
    pub fn initialize(app_handle: AppHandle, event_emitter: EventEmitter) {
        let event_emitter = Arc::new(event_emitter);
        let services = Self::new(app_handle, event_emitter);
        SERVICES.set(services).expect("Failed to set services");
    }
}

// Global access to services (lazy initialized)
static SERVICES: OnceLock<Services> = OnceLock::new();

pub fn get_services() -> &'static Services {
    SERVICES
        .get()
        .expect("Services not initialized. Call Services::initialize() during app setup")
}
