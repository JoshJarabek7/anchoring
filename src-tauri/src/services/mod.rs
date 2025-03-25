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
    sender: flume::Sender<Task>,
    active_tasks: Arc<RwLock<HashMap<String, Task>>>,
    cancellation_flags: Arc<RwLock<HashMap<String, Arc<Mutex<bool>>>>>,
    event_emitter: Arc<EventEmitter>,
}

impl WorkerPool {
    pub fn new(event_emitter: Arc<EventEmitter>) -> Self {
        // Use flume instead of mpsc for more efficient work-stealing pattern
        let (sender, receiver) = flume::unbounded::<Task>();
        let active_tasks = Arc::new(RwLock::new(HashMap::<String, Task>::new()));
        let cancellation_flags = Arc::new(RwLock::new(HashMap::<String, Arc<Mutex<bool>>>::new()));

        // Use more worker threads than CPU cores to improve parallelism with I/O operations
        // The optimal ratio depends on the application's workload - for web crawling which is
        // heavily I/O bound, using more threads than cores improves throughput
        let num_cores = std::thread::available_parallelism()
            .map(NonZeroUsize::get)
            .unwrap_or(1);

        // Create workers based on available cores, with more threads for better I/O parallelism
        // For 8 cores, this will create 16 workers, balancing CPU usage and I/O waiting

        // Create worker tasks
        for worker_id in 0..num_cores {
            // Each worker gets its own clone of the receiver
            let worker_receiver = receiver.clone();
            let worker_event_emitter = event_emitter.clone();
            let worker_active_tasks = active_tasks.clone();
            let worker_cancellation_flags = cancellation_flags.clone();

            // Spawn the worker task
            tauri::async_runtime::spawn(async move {
                println!("Worker {worker_id} started");

                // Workers can efficiently pull tasks without mutex contention
                while let Ok(task) = worker_receiver.recv_async().await {
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
                                        // Check if the URL has markdown or HTML content - Allow URLs with error status
                                        let has_content =
                                            url_obj.html.is_some() || url_obj.markdown.is_some();

                                        if has_content {
                                            // Choose source content - prefer markdown if available
                                            let source_content = if let Some(markdown) =
                                                &url_obj.markdown
                                            {
                                                markdown.clone()
                                            } else if let Some(html) = &url_obj.html {
                                                // Convert HTML to markdown
                                                match services
                                                    .crawler
                                                    .convert_html_to_markdown(&html)
                                                {
                                                    Ok(md) => md,
                                                    Err(e) => {
                                                        // Error converting HTML to markdown
                                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                                            &task.id,
                                                            &format!("Failed to convert HTML to markdown: {}", e),
                                                        ) {
                                                            eprintln!("Error emitting task error event: {}", e);
                                                        }
                                                        continue;
                                                    }
                                                }
                                            } else {
                                                // No content available (should not happen due to earlier check)
                                                if let Err(e) = worker_event_emitter
                                                    .emit_task_error(
                                                        &task.id,
                                                        "No content available to clean",
                                                    )
                                                {
                                                    eprintln!(
                                                        "Error emitting task error event: {}",
                                                        e
                                                    );
                                                }
                                                continue;
                                            };

                                            // Update progress
                                            if let Err(e) = worker_event_emitter.emit_task_updated(
                                                &task.id,
                                                40,
                                                "cleaning_markdown",
                                            ) {
                                                eprintln!("Error updating task progress: {}", e);
                                            }

                                            // Use the intelligence service to clean markdown with retry logic
                                            let mut attempts = 0;
                                            const MAX_RETRY_ATTEMPTS: usize = 5;
                                            let mut delay_ms: u64 = 1000; // Start with 1s delay

                                            loop {
                                                attempts += 1;
                                                match services
                                                    .intelligence
                                                    .cleanup_markdown(&source_content)
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
                                                        match services
                                                            .documentation_urls
                                                            .update_url_cleaned_markdown(
                                                                url_id,
                                                                &clean_markdown,
                                                            )
                                                            .await
                                                        {
                                                            Ok(_) => {
                                                                // Set URL status to markdown_ready regardless of previous error status
                                                                match services.documentation_urls
                                                                    .update_url_status(
                                                                        url_id,
                                                                        crate::db::models::UrlStatus::MarkdownReady,
                                                                    )
                                                                    .await
                                                                {
                                                                    Ok(_) => {
                                                                        // Update URL status
                                                                        if let Err(e) = worker_event_emitter
                                                                            .emit_url_status_updated(
                                                                                &url_id,
                                                                                "markdown_ready",
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
                                                                                    url_id,
                                                                                },
                                                                            )
                                                                        {
                                                                            eprintln!("Error emitting task completed event: {}", e);
                                                                        }
                                                                    }
                                                                    Err(e) => {
                                                                        eprintln!("Error updating URL status: {}", e);
                                                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                                                            &task.id,
                                                                            &format!("Failed to update URL status: {}", e),
                                                                        ) {
                                                                            eprintln!("Error emitting task error event: {}", e);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            Err(e) => {
                                                                eprintln!("Error saving cleaned markdown: {}", e);
                                                                if let Err(e) = worker_event_emitter.emit_task_error(
                                                                    &task.id,
                                                                    &format!("Failed to save cleaned markdown: {}", e),
                                                                ) {
                                                                    eprintln!("Error emitting task error event: {}", e);
                                                                }
                                                            }
                                                        }

                                                        // Successfully processed, break out of retry loop
                                                        break;
                                                    }
                                                    Err(e) => {
                                                        // Check for rate limiting error and retry if needed
                                                        if (e.contains("rate limit")
                                                            || e.contains("Too Many Requests"))
                                                            && attempts < MAX_RETRY_ATTEMPTS
                                                        {
                                                            // Update task status to waiting for retry
                                                            if let Err(e) = worker_event_emitter
                                                                .emit_task_updated(
                                                                    &task.id,
                                                                    40,
                                                                    &format!(
                                                                        "rate_limited_retry_{}",
                                                                        attempts
                                                                    ),
                                                                )
                                                            {
                                                                eprintln!("Error updating task progress: {}", e);
                                                            }

                                                            // Log the retry attempt
                                                            println!(
                                                                "Rate limit hit, retrying attempt {}/{} after {}ms delay",
                                                                attempts,
                                                                MAX_RETRY_ATTEMPTS,
                                                                delay_ms
                                                            );

                                                            // Wait with exponential backoff
                                                            tokio::time::sleep(
                                                                std::time::Duration::from_millis(
                                                                    delay_ms,
                                                                ),
                                                            )
                                                            .await;

                                                            // Increase delay for next attempt (exponential backoff)
                                                            delay_ms =
                                                                std::cmp::min(delay_ms * 2, 30000); // Cap at 30 seconds

                                                            // Continue to next retry attempt
                                                            continue;
                                                        } else {
                                                            // Non-rate limit error or max retries reached
                                                            eprintln!("Error cleaning markdown after {} attempts: {}", attempts, e);

                                                            // Only update status to error if we don't already have cleaned markdown
                                                            if url_obj.cleaned_markdown.is_none() {
                                                                // Mark as error since we couldn't clean
                                                                if let Err(status_err) = services.documentation_urls
                                                                    .update_url_status(
                                                                        url_id,
                                                                        crate::db::models::UrlStatus::MarkdownError,
                                                                    )
                                                                    .await
                                                                {
                                                                    eprintln!("Error updating URL status: {}", status_err);
                                                                }
                                                            }

                                                            if let Err(e) = worker_event_emitter
                                                                .emit_task_error(
                                                                    &task.id,
                                                                    &format!(
                                                                    "Failed to clean markdown: {}",
                                                                    e
                                                                ),
                                                                )
                                                            {
                                                                eprintln!("Error emitting task error event: {}", e);
                                                            }

                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        } else {
                                            // No content to clean
                                            if let Err(e) = worker_event_emitter.emit_task_error(
                                                &task.id,
                                                "No content available to clean",
                                            ) {
                                                eprintln!("Error emitting task error event: {}", e);
                                            }
                                        }
                                    }
                                    Ok(None) => {
                                        // URL not found
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("URL with ID {} not found", url_id),
                                        ) {
                                            eprintln!("Error emitting task error event: {}", e);
                                        }
                                    }
                                    Err(e) => {
                                        // Database error
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("Database error: {}", e),
                                        ) {
                                            eprintln!("Error emitting task error event: {}", e);
                                        }
                                    }
                                }
                            }
                            "generate_snippets" => {
                                // Extract parameters from task payload
                                let url_id = task.payload.url_id;

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
                                        // Get the technology and version for this URL
                                        match services
                                            .documentation_urls
                                            .get_tech_and_version_for_url(url_id)
                                            .await
                                        {
                                            Ok((tech, ver)) => {
                                                // Update progress
                                                if let Err(e) = worker_event_emitter
                                                    .emit_task_updated(
                                                        &task.id,
                                                        40,
                                                        "processing_documentation",
                                                    )
                                                {
                                                    eprintln!(
                                                        "Error updating task progress: {}",
                                                        e
                                                    );
                                                }

                                                // Create helper for progress updates
                                                let helper = DocumentationServiceHelper {
                                                    task_id: task.id.clone(),
                                                    url_id,
                                                    event_emitter: worker_event_emitter.clone(),
                                                };

                                                // Process URL into snippets
                                                match services
                                                    .documentation
                                                    .process_url_to_snippets_with_progress(
                                                        url_id,
                                                        &tech,
                                                        &ver,
                                                        Some(&helper),
                                                    )
                                                    .await
                                                {
                                                    Ok(snippet_ids) => {
                                                        // Emit completion event with snippet count
                                                        if let Err(e) = worker_event_emitter
                                                            .emit_task_completed(
                                                                &task.id,
                                                                TaskCompletedResult {
                                                                    snippets_count: Some(
                                                                        snippet_ids.len(),
                                                                    ),
                                                                    url_id,
                                                                },
                                                            )
                                                        {
                                                            eprintln!("Error emitting task completion: {}", e);
                                                        }
                                                    }
                                                    Err(e) => {
                                                        eprintln!(
                                                            "Error processing snippets: {}",
                                                            e
                                                        );
                                                        if let Err(e) = worker_event_emitter
                                                            .emit_task_error(
                                                                &task.id,
                                                                &format!(
                                                                "Failed to process snippets: {}",
                                                                e
                                                            ),
                                                            )
                                                        {
                                                            eprintln!("Error emitting task error event: {}", e);
                                                        }
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("Error getting tech and version: {}", e);
                                                if let Err(e) = worker_event_emitter
                                                    .emit_task_error(
                                                        &task.id,
                                                        &format!(
                                                            "Failed to get tech and version: {}",
                                                            e
                                                        ),
                                                    )
                                                {
                                                    eprintln!(
                                                        "Error emitting task error event: {}",
                                                        e
                                                    );
                                                }
                                            }
                                        }
                                    }
                                    Ok(None) => {
                                        // URL not found
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("URL with ID {} not found", url_id),
                                        ) {
                                            eprintln!("Error emitting task error event: {}", e);
                                        }
                                    }
                                    Err(e) => {
                                        // Database error
                                        if let Err(e) = worker_event_emitter.emit_task_error(
                                            &task.id,
                                            &format!("Database error: {}", e),
                                        ) {
                                            eprintln!("Error emitting task error event: {}", e);
                                        }
                                    }
                                }
                            }
                            // Default case for unknown task types
                            _ => {
                                println!("Unknown task type: {}", task.task_type);
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
                        // Use task.payload.url_id instead of Uuid::nil() if available
                        let url_id = task.payload.url_id; // Use the actual URL ID from the task payload
                        if let Err(e) = worker_event_emitter.emit_task_completed(
                            &task.id,
                            TaskCompletedResult {
                                snippets_count: None,
                                url_id,
                            },
                        ) {
                            eprintln!("Error emitting task completed event: {}", e);
                        }
                    }

                    // Clean up
                    worker_active_tasks.write().unwrap().remove(&task.id);
                    worker_cancellation_flags.write().unwrap().remove(&task.id);
                }

                println!("Worker shutting down");
            });
        }

        Self {
            sender,
            active_tasks,
            cancellation_flags,
            event_emitter: event_emitter.clone(),
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

        // Send task to worker pool via flume
        if let Err(_) = self.sender.send_async(task.clone()).await {
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
            if let Some(task) = self.active_tasks.write().unwrap().get_mut(task_id) {
                task.status = TaskStatus::Cancelled;
            }

            Ok(())
        } else {
            Err(format!("Task not found: {}", task_id))
        }
    }

    /// Get the status of a task
    // This method is not currently used in the codebase and is kept commented to avoid warnings
    // pub fn get_task_status(&self, task_id: &str) -> Option<TaskStatus> {
    //     self.active_tasks
    //         .read()
    //         .unwrap()
    //         .get(task_id)
    //         .map(|task| task.status.clone())
    // }

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
}

impl Services {
    pub fn new(event_emitter: Arc<EventEmitter>) -> Self {
        let worker_pool = WorkerPool::new(event_emitter.clone());

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
        }
    }

    // Initialize service with event emitter - should be called during app setup
    pub fn initialize(event_emitter: EventEmitter) {
        let event_emitter = Arc::new(event_emitter);
        let services = Self::new(event_emitter);
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
