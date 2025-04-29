use crate::db::models::{CrawlingSettings, UrlStatus};
use crate::db::repositories::crawling_settings::{
    get_crawling_settings_for_version, get_or_create_default_settings, save_crawling_settings,
};
use crate::services::{self, events::TaskPayload, DocumentationUrlService, Task};
use html2md;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use url::Url;
use uuid::Uuid;

#[derive(Debug)]
pub struct CrawlerService {
    url_service: DocumentationUrlService,
    processed_urls: Arc<Mutex<HashSet<String>>>,
}

/// Active crawl processes tracking
static ACTIVE_CRAWLS: once_cell::sync::Lazy<Arc<Mutex<HashMap<(Uuid, Uuid), bool>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Configuration for starting a crawl process
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlConfig {
    pub technology_id: Uuid,
    pub version_id: Uuid,
    pub start_url: String,
    pub prefix_path: String,
    pub anti_paths: Option<Vec<String>>,
    pub anti_keywords: Option<Vec<String>>,
    pub skip_processed_urls: Option<bool>,
}

impl Default for CrawlerService {
    fn default() -> Self {
        Self::new()
    }
}

impl CrawlerService {
    /// Create a new CrawlerService instance
    pub fn new() -> Self {
        Self {
            url_service: DocumentationUrlService::new(),
            processed_urls: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Helper function to normalize anti-keywords into a properly formatted Vec<String>
    fn normalize_anti_keywords(&self, anti_keywords: &Option<Vec<String>>) -> Vec<String> {
        match anti_keywords {
            Some(keywords) => {
                if keywords.len() == 1 && keywords[0].contains(',') {
                    // This is likely a comma-separated string from the database
                    println!("Splitting comma-separated anti-keywords: {:?}", keywords[0]);
                    keywords[0]
                        .split(',')
                        .map(|k| k.trim().to_string())
                        .filter(|k| !k.is_empty())
                        .collect()
                } else {
                    // Multiple keywords, use as is
                    println!("Using anti-keywords array as-is: {:?}", keywords);
                    keywords.clone()
                }
            }
            None => Vec::new(),
        }
    }

    /// Mark a URL as processed in the in-memory cache
    pub fn mark_url_processed(&self, url: &str) {
        // Minimize lock contention by keeping the mutex locked for minimal time
        let url_string = url.to_string(); // Create the string outside the lock
        let mut processed = self.processed_urls.lock().unwrap();
        processed.insert(url_string);
    }

    /// Check if a URL has been processed
    pub async fn is_url_processed_async(
        &self,
        url: &str,
        technology_id: Uuid,
        version_id: Uuid,
    ) -> bool {
        // First check in-memory cache
        let in_memory_processed = {
            let processed = self.processed_urls.lock().unwrap();
            processed.contains(url)
        };

        if in_memory_processed {
            // URL is in our in-memory cache, but let's double-check if it should be excluded from "processed"
            // by checking its status in the database
            match self
                .url_service
                .get_url_by_url(technology_id, version_id, url)
                .await
            {
                Ok(Some(url_record)) => {
                    let status = url_record.get_status();
                    // If the URL is in a pending state, don't consider it processed
                    // despite being in our in-memory cache
                    if status == UrlStatus::PendingCrawl
                        || status == UrlStatus::Crawling
                        || status == UrlStatus::PendingMarkdown
                        || status == UrlStatus::PendingProcessing
                        || status == UrlStatus::CrawlError
                    {
                        println!(
                            "URL is in memory cache but has pending status {:?}, will process: {}",
                            status, url
                        );
                        false
                    } else {
                        true
                    }
                }
                // If URL not found in DB or error occurs, rely on in-memory state
                _ => true,
            }
        } else {
            false
        }
    }

    /// Synchronous version that just checks the in-memory cache
    /// This is a fast check that doesn't require DB access
    pub fn is_url_processed(&self, url: &str) -> bool {
        // Minimize mutex hold time by using a scoped block
        let is_processed = {
            let processed = self.processed_urls.lock().unwrap();
            processed.contains(url)
        };
        is_processed
    }

    /// Get access to the global worker pool
    pub fn worker_pool(&self) -> &services::WorkerPool {
        &services::get_services().worker_pool
    }

    /// Get access to the global event emitter
    pub fn event_emitter(&self) -> &Arc<services::EventEmitter> {
        &services::get_services().event_emitter
    }

    /// Convert HTML to Markdown
    pub fn convert_html_to_markdown(&self, html: &str) -> Result<String, String> {
        // Use the html2md crate to convert HTML to Markdown
        let markdown = html2md::parse_html(html);
        Ok(markdown)
    }

    /// Extract links from HTML content
    pub fn extract_links_from_html(&self, html: &str, base_url: &str) -> Vec<String> {
        let mut links = Vec::new();

        // Try to parse base URL
        let base = match Url::parse(base_url) {
            Ok(url) => url,
            Err(e) => {
                println!("ERROR: Failed to parse base URL '{}': {}", base_url, e);
                return links;
            }
        };

        // Use a simple regex-based approach to extract links
        let link_regex = regex::Regex::new(r#"<a[^>]+href=["']([^"']+)["']"#)
            .unwrap_or_else(|_| regex::Regex::new(r#"href=["']([^"']+)["']"#).unwrap());

        let mut raw_links_count = 0;
        let mut _valid_links_count = 0;
        let mut _http_links_count = 0;

        for cap in link_regex.captures_iter(html) {
            if let Some(href_match) = cap.get(1) {
                let href = href_match.as_str();
                raw_links_count += 1;

                // Convert relative links to absolute
                match base.join(href) {
                    Ok(absolute_url) => {
                        _valid_links_count += 1;

                        // Remove fragments
                        let mut url_string = absolute_url.to_string();
                        if let Some(pos) = url_string.find('#') {
                            url_string.truncate(pos);
                        }

                        // Only include http/https URLs
                        if url_string.starts_with("http://") || url_string.starts_with("https://") {
                            _http_links_count += 1;
                            links.push(url_string);
                        }
                    }
                    Err(e) => {
                        if raw_links_count < 5 {
                            // Limit logging to avoid spam
                            println!("Failed to join URL '{}' with base '{}': {}", href, base, e);
                        }
                    }
                }
            }
        }

        // Return unique links
        links.sort();
        links.dedup();

        links
    }

    /// Check if URL should be crawled based on configuration
    pub fn should_crawl_url(
        &self,
        url: &str,
        prefix_path: &str,
        anti_paths: &[String],
        anti_keywords: &[String],
    ) -> bool {
        // Debug logging for anti_keywords
        println!(
            "DEBUG: Checking URL '{}' against {} anti-keywords: {:?}",
            url,
            anti_keywords.len(),
            anti_keywords
        );

        // Parse the URL first
        let parsed_url = match Url::parse(url) {
            Ok(url) => url,
            Err(e) => {
                println!("Invalid URL '{}': {}", url, e);
                return false;
            }
        };

        // Get the path and query for filtering
        let path_and_query = parsed_url.path().to_string()
            + parsed_url
                .query()
                .map(|q| format!("?{}", q))
                .unwrap_or_default()
                .as_str();

        // Create relevant representations of the URL for matching
        let full_url_lower = url.to_lowercase();
        let path_lower = path_and_query.to_lowercase();
        let host_lower = parsed_url.host_str().unwrap_or("").to_lowercase();
        let prefix_lower = prefix_path.to_lowercase();

        // Also create a normalized version without scheme for easier pattern matching
        let normalized_url = format!("{}{}", host_lower, path_lower);

        // First check if URL starts with prefix path (if provided)
        if !prefix_path.is_empty() {
            let matches_prefix = if prefix_lower.starts_with("http") {
                // Full URL prefix
                full_url_lower.starts_with(&prefix_lower)
            } else if prefix_lower.contains("/") {
                // Path-only prefix
                path_lower.starts_with(&prefix_lower.trim_start_matches('/'))
            } else {
                // Host or path prefix
                host_lower.contains(&prefix_lower) || path_lower.starts_with(&prefix_lower)
            };

            if !matches_prefix {
                println!("URL doesn't match prefix path '{}': {}", prefix_path, url);
                return false;
            }
        }

        // Check for anti-keywords in any part of the URL
        for keyword in anti_keywords {
            let keyword_lower = keyword.trim().to_lowercase();
            if !keyword_lower.is_empty()
                && (full_url_lower.contains(&keyword_lower)
                    || normalized_url.contains(&keyword_lower)
                    || path_lower.contains(&keyword_lower))
            {
                println!("URL filtered by anti-keyword '{}': {}", keyword, url);
                println!("  - URL: {}", full_url_lower);
                println!("  - Normalized: {}", normalized_url);
                println!("  - Path: {}", path_lower);
                return false;
            }
        }

        // Check for anti-paths in all representations of the URL
        for path in anti_paths {
            let path_pattern = path.trim().to_lowercase();
            if path_pattern.is_empty() {
                continue;
            }

            // Check for different types of pattern matches
            let matches_pattern = if path_pattern.starts_with("http") {
                // Full URL pattern
                full_url_lower.contains(&path_pattern)
            } else if path_pattern.contains("://") {
                // URL without scheme
                normalized_url.contains(&path_pattern.split("://").last().unwrap_or(""))
            } else if path_pattern.contains("/") {
                // Path pattern
                path_lower.contains(&path_pattern.trim_start_matches('/'))
            } else {
                // General pattern, check anywhere
                full_url_lower.contains(&path_pattern) || path_lower.contains(&path_pattern)
            };

            if matches_pattern {
                println!("URL filtered by anti-path '{}': {}", path, url);
                return false;
            }
        }

        // URL passed all filters
        true
    }

    /// Get crawling settings for a version
    pub async fn get_crawling_settings_for_version(
        &self,
        version_id: Uuid,
    ) -> Result<Option<CrawlingSettings>, String> {
        get_crawling_settings_for_version(version_id)
            .await
            .map_err(|e| format!("Database error: {}", e))
    }

    /// Get or create default crawling settings for a version
    pub async fn get_or_create_default_settings(
        &self,
        version_id: Uuid,
    ) -> Result<CrawlingSettings, String> {
        get_or_create_default_settings(version_id)
            .await
            .map_err(|e| format!("Database error: {}", e))
    }

    /// Save crawling settings
    pub async fn save_crawling_settings(
        &self,
        crawl_settings: CrawlingSettings,
    ) -> Result<CrawlingSettings, String> {
        save_crawling_settings(crawl_settings)
            .await
            .map_err(|e| format!("Database error: {}", e))
    }

    /// Start recursive crawling from a URL with the global worker pool
    pub async fn start_crawling(&self, config: CrawlConfig) -> Result<String, String> {
        let _start_time = Instant::now(); // Keep for future use with timeout
        println!(
            "Starting parallel crawling for URL: {} (tech {}, ver {})",
            config.start_url, config.technology_id, config.version_id
        );

        // Get configuration values
        let anti_paths_vec = config.anti_paths.clone().unwrap_or_default();

        // Fix anti_keywords handling by checking if we have a single string containing commas
        let anti_keywords_vec = self.normalize_anti_keywords(&config.anti_keywords);

        let skip_processed = config.skip_processed_urls.unwrap_or(true); // Default to true - don't recrawl URLs

        // Check that the start URL passes all filters including prefix path check
        if !self.should_crawl_url(
            &config.start_url,
            &config.prefix_path,
            &anti_paths_vec,
            &anti_keywords_vec,
        ) {
            return Err(format!(
                "Start URL '{}' doesn't match required filters. It may not start with the prefix path or may match anti-patterns. Please choose a different start URL.", 
                config.start_url
            ));
        }

        // Print crawling configuration
        println!(
            "CRAWL CONFIG: Prefix path: '{}', Skip processed: {}",
            config.prefix_path, skip_processed
        );
        println!("CRAWL CONFIG: Anti-paths: {:?}", anti_paths_vec);
        println!("CRAWL CONFIG: Anti-keywords: {:?}", anti_keywords_vec);

        // Register this tech/version pair as actively crawling
        {
            let mut active_crawls = ACTIVE_CRAWLS.lock().map_err(|e| e.to_string())?;
            active_crawls.insert((config.technology_id, config.version_id), true);
        }

        // Unmark any URLs with pending status from the in-memory processed cache
        if let Err(e) = self
            .check_and_unmark_pending_urls(config.technology_id, config.version_id)
            .await
        {
            println!("Warning: Failed to unmark pending URLs: {}", e);
        }

        // Check if the URL is already processed (in memory)
        let already_processed_in_memory =
            skip_processed && self.is_url_processed(&config.start_url);

        // Check if URL exists in database
        let url_obj = match self
            .url_service
            .get_url_by_url(config.technology_id, config.version_id, &config.start_url)
            .await
        {
            Ok(Some(existing)) => {
                println!("Start URL already exists in database: {}", config.start_url);

                // Check if the URL is already processed (based on status)
                let status = existing.get_status();
                let already_processed_in_db = skip_processed
                    && status != UrlStatus::PendingCrawl
                    && status != UrlStatus::PendingMarkdown
                    && status != UrlStatus::PendingProcessing
                    && status != UrlStatus::Crawling
                    && status != UrlStatus::CrawlError;

                if already_processed_in_db && already_processed_in_memory {
                    println!(
                        "Start URL already processed with status {:?}, skipping crawl task",
                        status
                    );

                    // Emit app notification about skipping the crawl
                    let _ = self.event_emitter().emit_app_notification(
                        "URL Already Processed",
                        &format!(
                            "URL {} is already processed and won't be crawled again",
                            config.start_url
                        ),
                        Some("info"),
                    );

                    // Return a placeholder task ID since we're not creating a real task
                    return Ok(Uuid::new_v4().to_string());
                }

                existing
            }
            Ok(None) => {
                // Add start URL to database
                match self
                    .url_service
                    .add_url(&config.start_url, config.technology_id, config.version_id)
                    .await
                {
                    Ok(url) => {
                        println!("Added start URL to database: {}", config.start_url);
                        url
                    }
                    Err(e) => {
                        return Err(format!("Failed to add start URL to database: {}", e));
                    }
                }
            }
            Err(e) => {
                return Err(format!("Failed to check if URL exists in database: {}", e));
            }
        };

        // Skip creating a task if the URL is already processed in memory
        if already_processed_in_memory {
            println!(
                "Start URL already processed in memory, skipping crawl task: {}",
                config.start_url
            );

            // Emit app notification about skipping the crawl
            let _ = self.event_emitter().emit_app_notification(
                "URL Already Processed",
                &format!(
                    "URL {} is already processed and won't be crawled again",
                    config.start_url
                ),
                Some("info"),
            );

            // Return a placeholder task ID since we're not creating a real task
            return Ok(Uuid::new_v4().to_string());
        }

        // Create a task for the crawl operation using our global worker pool
        let task_payload = TaskPayload {
            url: config.start_url.clone(),
            prefix_path: config.prefix_path,
            anti_paths: anti_paths_vec,
            anti_keywords: anti_keywords_vec,
            skip_processed,
            url_id: url_obj.id,
        };

        // Create the task
        let task = Task::new(
            "crawl_url",
            Some(config.technology_id),
            Some(config.version_id),
            task_payload,
        );

        // Submit the task to the worker pool
        let task_id = self.worker_pool().queue_task(task).await?;

        // Emit URL status updated event
        let _ = self
            .event_emitter()
            .emit_url_status_updated(&url_obj.id, "pending_crawl");

        // Emit app notification about starting the crawl
        let _ = self.event_emitter().emit_app_notification(
            "Crawling Started",
            &format!("Started crawling from URL: {}", config.start_url),
            Some("info"),
        );

        // Return the task ID for tracking
        Ok(task_id)
    }

    // Batch processing methods have been moved to commands.rs for direct task queueing

    /// Stop all active crawling processes and clear the task queue
    pub fn stop_all_crawling(&self) -> Result<(), String> {
        let mut active_crawls = ACTIVE_CRAWLS.lock().map_err(|e| e.to_string())?;
        let count = active_crawls.len();

        // Set all pairs to stop flag
        for (_, active) in active_crawls.iter_mut() {
            *active = false;
        }

        // Get active tasks from global worker pool
        let active_tasks = self.worker_pool().get_active_tasks();
        let mut cancelled_count = 0;

        // Cancel all crawl-related tasks
        for task in active_tasks {
            if task.task_type == "crawl_url" {
                if let Err(e) = self.worker_pool().cancel_task(&task.id) {
                    println!("Warning: Failed to cancel task {}: {}", task.id, e);
                } else {
                    cancelled_count += 1;
                }
            }
        }

        // Emit notification event for stopping all crawls
        let _ = self.event_emitter().emit_app_notification(
            "Crawling Stopped",
            &format!(
                "Stopped {} active crawling processes ({} tasks cancelled)",
                count, cancelled_count
            ),
            Some("info"),
        );

        if count > 0 || cancelled_count > 0 {
            println!(
                "Signaled {} active crawling processes to stop ({} tasks cancelled)",
                count, cancelled_count
            );
            Ok(())
        } else {
            println!("No active crawling processes to stop");
            Err("No active crawling processes".to_string())
        }
    }

    /// Stop crawling for a specific technology and version
    pub fn stop_tech_version_crawling(
        &self,
        technology_id: Uuid,
        version_id: Uuid,
    ) -> Result<(), String> {
        let mut active_crawls = ACTIVE_CRAWLS.lock().map_err(|e| e.to_string())?;

        if let Some(active) = active_crawls.get_mut(&(technology_id, version_id)) {
            *active = false;
            println!(
                "Signaled crawling to stop for technology {} version {}",
                technology_id, version_id
            );

            // Emit notification about stopping this crawl
            let _ = self.event_emitter().emit_app_notification(
                "Crawling Stopped",
                &format!(
                    "Stopped crawling for technology {} version {}",
                    technology_id, version_id
                ),
                Some("info"),
            );

            Ok(())
        } else {
            println!(
                "No active crawling for technology {} version {}",
                technology_id, version_id
            );
            Err(format!(
                "No active crawling for technology {} version {}",
                technology_id, version_id
            ))
        }
    }

    /// Crawl a single URL and store the result
    pub async fn crawl_url(
        &self,
        technology_id: Uuid,
        version_id: Uuid,
        url: &str,
    ) -> Result<(), String> {
        println!("Starting crawl for URL: {}", url);

        // First update the URL status to crawling
        let url_obj = match self
            .url_service
            .get_url_by_url(technology_id, version_id, url)
            .await
        {
            Ok(Some(record)) => record,
            Ok(None) => {
                // Create new URL record
                match self
                    .url_service
                    .add_url(url, technology_id, version_id)
                    .await
                {
                    Ok(url) => url,
                    Err(e) => return Err(format!("Failed to create URL record: {}", e)),
                }
            }
            Err(e) => return Err(format!("Failed to check if URL exists: {}", e)),
        };

        // Get the task payload from the URL's record or the parent task
        // to retrieve filter settings if available
        let task_id = Uuid::new_v4().to_string();

        // Attempt to retrieve the current task to get filter settings
        let current_task = services::get_services()
            .worker_pool
            .get_active_tasks()
            .into_iter()
            .find(|t| t.payload.url_id == url_obj.id);

        if let Some(task) = current_task {
            // If we have anti-patterns in the task payload, check if URL should be skipped
            if !task.payload.anti_paths.is_empty() || !task.payload.anti_keywords.is_empty() {
                if !self.should_crawl_url(
                    url,
                    &task.payload.prefix_path,
                    &task.payload.anti_paths,
                    &task.payload.anti_keywords,
                ) {
                    println!("URL matches anti-patterns, skipping: {}", url);

                    // Update URL status to skipped
                    if let Ok(_) = self
                        .url_service
                        .update_url_status(url_obj.id, UrlStatus::Skipped)
                        .await
                    {
                        // Emit URL status updated event
                        let _ = self
                            .event_emitter()
                            .emit_url_status_updated(&url_obj.id, "skipped");
                    }

                    // Mark as processed to prevent future attempts
                    self.mark_url_processed(url);

                    return Ok(());
                }
            }
        }

        // Update URL status to crawling
        println!("Setting URL status to CRAWLING: {}", url);
        match self
            .url_service
            .update_url_status(url_obj.id, UrlStatus::Crawling)
            .await
        {
            Ok(_) => {
                // Emit URL status updated event
                let _ = self
                    .event_emitter()
                    .emit_url_status_updated(&url_obj.id, "crawling");
            }
            Err(e) => return Err(format!("Failed to update URL status to crawling: {}", e)),
        }

        // Update task progress
        let _ = self.event_emitter().emit_task_updated(
            &task_id,
            40, // 40% progress - fetching content
            "fetching_content",
        );

        // Step 1: Get browser service to fetch the content with timeout
        println!("Fetching content for URL: {}", url);
        let fetch_result = tokio::time::timeout(
            std::time::Duration::from_secs(180), // 3 minute timeout
            services::get_services()
                .browser
                .fetch_with_headless_browser(url.to_string()),
        )
        .await;

        // Handle timeout and fetch errors
        let html = match fetch_result {
            Ok(result) => match result {
                Ok(content) => {
                    println!(
                        "Successfully fetched content for URL: {} ({} bytes)",
                        url,
                        content.len()
                    );
                    content
                }
                Err(e) => {
                    // Update URL status to error
                    if let Ok(_) = self
                        .url_service
                        .update_url_status(url_obj.id, UrlStatus::CrawlError)
                        .await
                    {
                        // Emit URL status updated event
                        let _ = self
                            .event_emitter()
                            .emit_url_status_updated(&url_obj.id, "crawl_error");
                    }

                    // Update task progress (error)
                    let _ = self.event_emitter().emit_task_updated(
                        &task_id, 100, // 100% progress - completed with error
                        "error",
                    );

                    println!("ERROR: Browser fetch failed for URL {}: {}", url, e);
                    return Err(format!("Failed to fetch URL content: {}", e));
                }
            },
            Err(_) => {
                // Handle timeout by updating status to error
                if let Ok(_) = self
                    .url_service
                    .update_url_status(url_obj.id, UrlStatus::CrawlError)
                    .await
                {
                    // Emit URL status updated event
                    let _ = self
                        .event_emitter()
                        .emit_url_status_updated(&url_obj.id, "crawl_error");
                }

                // Update task progress (error - timeout)
                let _ = self.event_emitter().emit_task_updated(
                    &task_id, 100, // 100% progress - completed with error
                    "timeout",
                );

                println!("ERROR: Browser fetch timed out for URL: {}", url);
                return Err(format!("Timeout while fetching URL: {}", url));
            }
        };

        // Update task progress
        let _ = self.event_emitter().emit_task_updated(
            &task_id,
            60, // 60% progress - converting to markdown
            "converting_to_markdown",
        );

        // Step 2: Convert HTML to markdown directly
        println!("Converting HTML to markdown for URL: {}", url);
        let markdown = match self.convert_html_to_markdown(&html) {
            Ok(md) => {
                println!("Markdown conversion successful ({} bytes)", md.len());
                md
            }
            Err(e) => {
                // Update URL status to error
                if let Ok(_) = self
                    .url_service
                    .update_url_status(url_obj.id, UrlStatus::MarkdownError)
                    .await
                {
                    // Emit URL status updated event
                    let _ = self
                        .event_emitter()
                        .emit_url_status_updated(&url_obj.id, "markdown_error");
                }

                // Update task progress (error)
                let _ = self.event_emitter().emit_task_updated(
                    &task_id,
                    100, // 100% progress - completed with error
                    "markdown_error",
                );

                println!("ERROR: Markdown conversion failed for URL {}: {}", url, e);
                return Err(format!("Failed to convert HTML to markdown: {}", e));
            }
        };

        // Update task progress
        let _ = self.event_emitter().emit_task_updated(
            &task_id,
            80, // 80% progress - updating URL content
            "updating_content",
        );

        // Step 3: Update URL with HTML content
        println!(
            "Updating URL HTML content in database for URL: {} ({} bytes)",
            url,
            html.len()
        );
        match self.url_service.update_url_html(url_obj.id, &html).await {
            Ok(_) => println!(
                "Successfully stored HTML content ({} bytes) for URL: {}",
                html.len(),
                url
            ),
            Err(e) => {
                // Log error but continue
                println!("ERROR: Failed to update URL HTML content: {}", e);

                // Verify HTML was actually stored by retrieving it back
                match self.url_service.get_url_by_id(url_obj.id).await {
                    Ok(Some(url_record)) => {
                        if let Some(stored_html) = url_record.html {
                            println!(
                                "Verification: HTML was actually stored ({} bytes) for URL: {}",
                                stored_html.len(),
                                url
                            );
                        } else {
                            println!("ERROR: Verification failed - No HTML content was stored for URL: {}", url);
                        }
                    }
                    _ => println!("ERROR: Could not verify HTML storage for URL: {}", url),
                }
            }
        }

        // Step 4: Update URL with markdown content
        println!(
            "Updating URL markdown content in database for URL: {} ({} bytes)",
            url,
            markdown.len()
        );
        match self
            .url_service
            .update_url_markdown(url_obj.id, Some(markdown.clone()), None, UrlStatus::Crawled)
            .await
        {
            Ok(_) => println!("Successfully stored markdown content for URL: {}", url),
            Err(e) => {
                // Log error but continue
                println!("ERROR: Failed to update URL markdown content: {}", e);
            }
        }

        // Step 5: Update URL status to crawled
        println!("Setting URL status to CRAWLED: {}", url);
        match self
            .url_service
            .update_url_status(url_obj.id, UrlStatus::Crawled)
            .await
        {
            Ok(_) => {
                println!("URL status updated to CRAWLED: {}", url);

                // Emit URL status updated event
                let _ = self
                    .event_emitter()
                    .emit_url_status_updated(&url_obj.id, "crawled");

                // Update task progress (completed)
                let _ = self.event_emitter().emit_task_updated(
                    &task_id,
                    100, // 100% progress - completed
                    "completed",
                );
            }
            Err(e) => return Err(format!("Failed to update URL status: {}", e)),
        }

        println!("Crawl completed successfully for URL: {}", url);
        Ok(())
    }

    /// Process a URL including crawling and link extraction
    pub async fn process_url_with_links(
        &self,
        task_id: &str,
        technology_id: Uuid,
        version_id: Uuid,
        url: &str,
        prefix_path: &str,
        anti_paths: &[String],
        anti_keywords: &[String],
        skip_processed: bool,
    ) -> Result<(), String> {
        println!("======== BEGIN PROCESSING URL: {} ========", url);

        // Emit progress update for this task
        let _ = self.event_emitter().emit_task_updated(
            task_id,
            20, // 20% progress - checking filters
            "filtering",
        );

        // Normalize the URL first
        let normalized_url = match Url::parse(url) {
            Ok(mut parsed) => {
                // Remove fragment
                parsed.set_fragment(None);
                // Remove default ports
                if (parsed.scheme() == "http" && parsed.port() == Some(80))
                    || (parsed.scheme() == "https" && parsed.port() == Some(443))
                {
                    parsed.set_port(None).ok();
                }
                parsed.to_string()
            }
            Err(e) => {
                println!("ERROR: Invalid URL {}: {}", url, e);
                return Err(format!("Invalid URL: {}", e));
            }
        };

        // Check if URL is in database and has a pending status - if so, unmark it
        match self
            .url_service
            .get_url_by_url(technology_id, version_id, &normalized_url)
            .await
        {
            Ok(Some(url_obj)) => {
                // Check the status - if it's in a pending state, make sure it's not in our processed cache
                let status = url_obj.get_status();
                if status == UrlStatus::PendingCrawl
                    || status == UrlStatus::Crawling
                    || status == UrlStatus::PendingMarkdown
                    || status == UrlStatus::PendingProcessing
                    || status == UrlStatus::CrawlError
                {
                    // Unmark from the processed cache to ensure it's processed
                    self.unmark_url_processed(&normalized_url);
                    println!(
                        "URL has pending status {:?}, unmarked from processed cache: {}",
                        status, normalized_url
                    );
                }
            }
            _ => {}
        };

        // Check if URL should be skipped based on anti-patterns
        if !self.should_crawl_url(&normalized_url, prefix_path, anti_paths, anti_keywords) {
            println!("URL matches anti-patterns, skipping: {}", normalized_url);

            // Emit progress update
            let _ = self.event_emitter().emit_task_updated(
                task_id, 100, // 100% progress - completed (skipped)
                "skipped",
            );

            // Mark URL as skipped in database and clear any content
            match self
                .url_service
                .get_url_by_url(technology_id, version_id, &normalized_url)
                .await
            {
                Ok(Some(url_obj)) => {
                    let _ = self
                        .url_service
                        .update_url_status(url_obj.id, UrlStatus::Skipped)
                        .await;

                    // Emit URL status updated event
                    let _ = self
                        .event_emitter()
                        .emit_url_status_updated(&url_obj.id, "skipped");

                    println!("Marked URL as skipped: {}", normalized_url);
                }
                _ => {} // URL not in database yet, nothing to update
            }

            // Mark as processed in memory to prevent future attempts
            if skip_processed {
                self.mark_url_processed(&normalized_url);
            }

            return Ok(());
        }

        // Check for duplicates before crawling
        let already_processed = if skip_processed {
            // Use the async version that also checks DB status
            self.is_url_processed_async(&normalized_url, technology_id, version_id)
                .await
        } else {
            false
        };

        if already_processed {
            println!("URL already processed, skipping: {}", normalized_url);

            // Emit progress update (completed - already processed)
            let _ = self.event_emitter().emit_task_updated(
                task_id,
                100, // 100% progress - completed (already processed)
                "already_processed",
            );

            return Ok(());
        }

        // Emit progress update
        let _ = self.event_emitter().emit_task_updated(
            task_id, 30, // 30% progress - crawling
            "crawling",
        );

        // First crawl the URL to fetch its content
        let html = match self
            .crawl_url(technology_id, version_id, &normalized_url)
            .await
        {
            Ok(_) => {
                // Get the URL record with the HTML content
                match self
                    .url_service
                    .get_url_by_url(technology_id, version_id, &normalized_url)
                    .await
                {
                    Ok(Some(url_record)) => {
                        if let Some(html_content) = url_record.html {
                            html_content
                        } else {
                            println!(
                                "WARNING: URL record has no HTML content: {}",
                                normalized_url
                            );
                            // Mark as processed anyway to avoid getting stuck
                            if skip_processed {
                                self.mark_url_processed(&normalized_url);
                            }

                            // Emit task updated event (error)
                            let _ = self.event_emitter().emit_task_updated(
                                task_id, 100, // 100% progress - completed with error
                                "error",
                            );

                            return Err("URL record has no HTML content".to_string());
                        }
                    }
                    Ok(None) => {
                        println!(
                            "WARNING: Failed to get URL record after crawling: {}",
                            normalized_url
                        );
                        // Mark as processed anyway to avoid getting stuck
                        if skip_processed {
                            self.mark_url_processed(&normalized_url);
                        }

                        // Emit task updated event (error)
                        let _ = self.event_emitter().emit_task_updated(
                            task_id, 100, // 100% progress - completed with error
                            "error",
                        );

                        return Err("Failed to get URL record after crawling".to_string());
                    }
                    Err(e) => {
                        println!(
                            "ERROR: Failed to get URL record after crawling: {}: {}",
                            normalized_url, e
                        );
                        // Mark as processed anyway to avoid getting stuck
                        if skip_processed {
                            self.mark_url_processed(&normalized_url);
                        }

                        // Emit task updated event (error)
                        let _ = self.event_emitter().emit_task_updated(
                            task_id, 100, // 100% progress - completed with error
                            "error",
                        );

                        return Err(format!("Failed to get URL record after crawling: {}", e));
                    }
                }
            }
            Err(e) => {
                println!("ERROR: Failed to crawl URL {}: {}", normalized_url, e);
                // Mark as processed anyway to avoid getting stuck
                if skip_processed {
                    self.mark_url_processed(&normalized_url);
                }

                // Emit task updated event (error)
                let _ = self.event_emitter().emit_task_updated(
                    task_id, 100, // 100% progress - completed with error
                    "error",
                );

                return Err(format!("Failed to crawl URL: {}", e));
            }
        };

        // Emit progress update
        let _ = self.event_emitter().emit_task_updated(
            task_id,
            60, // 60% progress - extracting links
            "extracting_links",
        );

        // Check HTML content length
        if html.len() == 0 {
            println!("WARNING: HTML content is empty for URL: {}", normalized_url);
            return Err("HTML content is empty".to_string());
        }

        // Extract and normalize links from HTML
        let raw_links = self.extract_links_from_html(&html, &normalized_url);
        println!("Found {} raw links on {}", raw_links.len(), normalized_url);

        // Normalize all extracted links
        let mut normalized_links = Vec::with_capacity(raw_links.len());
        for link in raw_links {
            if let Ok(mut parsed) = Url::parse(&link) {
                // Remove fragment
                parsed.set_fragment(None);
                // Remove default ports
                if (parsed.scheme() == "http" && parsed.port() == Some(80))
                    || (parsed.scheme() == "https" && parsed.port() == Some(443))
                {
                    parsed.set_port(None).ok();
                }
                normalized_links.push(parsed.to_string());
            }
        }
        normalized_links.sort();
        normalized_links.dedup();

        // Filter links by prefix path and other criteria
        let mut valid_links = Vec::new();
        for link in normalized_links {
            // Skip self-references
            if link == normalized_url {
                continue;
            }

            // Skip already processed URLs - use async check that verifies DB status too
            if skip_processed
                && self
                    .is_url_processed_async(&link, technology_id, version_id)
                    .await
            {
                println!("Skipping already processed link: {}", link);
                continue;
            }

            // Apply all filters - prefix path, anti-paths, anti-keywords
            if self.should_crawl_url(&link, prefix_path, anti_paths, anti_keywords) {
                valid_links.push(link);
            } else {
                println!("Filtered out link: {}", link);
            }
        }

        // Emit progress update
        let _ = self.event_emitter().emit_task_updated(
            task_id,
            80, // 80% progress - adding links to queue
            "queueing_links",
        );

        if !valid_links.is_empty() {
            println!(
                "Adding {} filtered URLs to database and queue",
                valid_links.len()
            );
        }

        // Process valid links
        let mut added_count = 0;
        for link in valid_links {
            // Do a final check against anti-patterns just to be sure
            // This is redundant with the previous filter but adds protection against edge cases
            if !self.should_crawl_url(&link, prefix_path, anti_paths, anti_keywords) {
                println!("Final filter caught URL that should be skipped: {}", link);
                continue;
            }

            // Check if already processed in database before adding
            let already_in_db = match self
                .url_service
                .get_url_by_url(technology_id, version_id, &link)
                .await
            {
                Ok(Some(url)) => {
                    let status = url.get_status();
                    // Only consider it as already processed if it's not in a pending/crawling state
                    let is_processed = status != UrlStatus::PendingCrawl
                        && status != UrlStatus::PendingMarkdown
                        && status != UrlStatus::PendingProcessing
                        && status != UrlStatus::Crawling
                        && status != UrlStatus::CrawlError;

                    if is_processed {
                        println!(
                            "URL already exists with status {:?}, skipping: {}",
                            status, link
                        );
                        // Skip this URL
                        true
                    } else {
                        // URL exists but is in a pending state, we should process it
                        // Just use the existing record
                        println!(
                            "URL exists with pending status {:?}, will process: {}",
                            status, link
                        );

                        // Create a task for the crawler with the existing URL record
                        let task_payload = TaskPayload {
                            url: link.clone(),
                            prefix_path: prefix_path.to_string(),
                            anti_paths: anti_paths.to_vec(),
                            anti_keywords: anti_keywords.to_vec(),
                            skip_processed,
                            url_id: url.id,
                        };

                        // Create and queue the task
                        let task = Task::new(
                            "crawl_url",
                            Some(technology_id),
                            Some(version_id),
                            task_payload,
                        );

                        // Queue the task
                        let _ = self.worker_pool().queue_task(task).await;
                        added_count += 1;

                        true // URL is already in db, so don't add it again
                    }
                }
                _ => false, // URL not in database yet
            };

            // If URL is not already in database, add it
            if !already_in_db {
                // Add to database via url service
                match self
                    .url_service
                    .add_url(&link, technology_id, version_id)
                    .await
                {
                    Ok(url_obj) => {
                        println!("Added URL to database: {}", link);
                        added_count += 1;

                        // Emit URL status updated event
                        let _ = self
                            .event_emitter()
                            .emit_url_status_updated(&url_obj.id, "pending_crawl");

                        let task_payload = TaskPayload {
                            url: link.clone(),
                            prefix_path: prefix_path.to_string(),
                            anti_paths: anti_paths.to_vec(),
                            anti_keywords: anti_keywords.to_vec(),
                            skip_processed,
                            url_id: url_obj.id,
                        };

                        // Create a task for the crawler
                        let task = Task::new(
                            "crawl_url",
                            Some(technology_id),
                            Some(version_id),
                            task_payload,
                        );

                        // Queue the task
                        let _ = self.worker_pool().queue_task(task).await;
                    }
                    Err(e) => {
                        println!("Error adding URL to database: {}", e);
                    }
                }
            }

            // Mark as processed in memory if needed
            if skip_processed {
                self.mark_url_processed(&link);
            }
        }

        // Emit progress update (completed)
        let _ = self.event_emitter().emit_task_updated(
            task_id,
            100, // 100% progress - completed
            "completed",
        );

        println!(
            "======== END PROCESSING URL: {} (added {} new URLs) ========",
            normalized_url, added_count
        );

        Ok(())
    }

    /// Remove a URL from the processed cache to allow it to be crawled again
    pub fn unmark_url_processed(&self, url: &str) {
        // Remove URL from in-memory cache
        let url_string = url.to_string(); // Create the string outside the lock
        let mut processed = self.processed_urls.lock().unwrap();
        processed.remove(&url_string);
        println!("Removed URL from processed cache: {}", url);
    }

    /// Check and unmark URLs that are in pending state
    pub async fn check_and_unmark_pending_urls(
        &self,
        _technology_id: Uuid,
        version_id: Uuid,
    ) -> Result<usize, String> {
        // Get all URLs for this version
        let urls = match self
            .url_service
            .get_urls_for_version(version_id, false)
            .await
        {
            Ok(urls) => urls,
            Err(e) => return Err(format!("Failed to get URLs for version: {}", e)),
        };

        let mut unmarked_count = 0;

        // Check each URL's status and unmark if it's in a pending state
        for url in urls {
            let status = url.get_status();
            if status == UrlStatus::PendingCrawl
                || status == UrlStatus::Crawling
                || status == UrlStatus::PendingMarkdown
                || status == UrlStatus::PendingProcessing
                || status == UrlStatus::CrawlError
            {
                // Remove from in-memory cache to allow it to be crawled
                self.unmark_url_processed(&url.url);
                unmarked_count += 1;
            }
        }

        println!("Unmarked {} URLs with pending status", unmarked_count);
        Ok(unmarked_count)
    }
}
