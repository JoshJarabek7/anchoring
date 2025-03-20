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

    /// Mark a URL as processed in the in-memory cache
    pub fn mark_url_processed(&self, url: &str) {
        let mut processed = self.processed_urls.lock().unwrap();
        processed.insert(url.to_string());
    }

    /// Check if a URL has been processed
    pub fn is_url_processed(&self, url: &str) -> bool {
        let processed = self.processed_urls.lock().unwrap();
        processed.contains(url)
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
        // If prefix path is empty, allow all URLs
        if prefix_path.is_empty() {
            return true;
        }

        // Simple check - does the URL start with the specified prefix path
        // Make sure both strings are lowercase for comparison
        let url_lower = url.to_lowercase();
        let prefix_lower = prefix_path.to_lowercase();

        if !url_lower.starts_with(&prefix_lower) {
            return false;
        }

        // Check for anti-paths
        for path in anti_paths {
            if !path.is_empty() && url_lower.contains(&path.to_lowercase()) {
                return false;
            }
        }

        // Check for anti-keywords
        for keyword in anti_keywords {
            if !keyword.is_empty() && url_lower.contains(&keyword.to_lowercase()) {
                return false;
            }
        }

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
        let anti_keywords_vec = config.anti_keywords.clone().unwrap_or_default();
        let skip_processed = config.skip_processed_urls.unwrap_or(true); // Default to true - don't recrawl URLs

        // Check that the start URL doesn't contain anti-paths or anti-keywords
        if (!anti_paths_vec.is_empty() || !anti_keywords_vec.is_empty())
            && !self.should_crawl_url(
                &config.start_url,
                &config.prefix_path,
                &anti_paths_vec,
                &anti_keywords_vec,
            )
        {
            return Err(format!(
                "Start URL '{}' matches anti-patterns and would be filtered. Please choose a different start URL.", 
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

        // Add start URL to database
        let url_obj = match self
            .url_service
            .add_url(&config.start_url, config.technology_id, config.version_id)
            .await
        {
            Ok(url) => {
                println!("Added start URL to database: {}", config.start_url);
                url
            }
            Err(e) => {
                // The URL might already exist, so check if it does
                match self
                    .url_service
                    .get_url_by_url(config.technology_id, config.version_id, &config.start_url)
                    .await
                {
                    Ok(Some(existing)) => {
                        println!("Start URL already exists in database: {}", config.start_url);
                        existing
                    }
                    _ => {
                        return Err(format!("Failed to add start URL to database: {}", e));
                    }
                }
            }
        };

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

        // Generate a task ID to track this operation
        let task_id = Uuid::new_v4().to_string();

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
        println!("Updating URL HTML content in database for URL: {}", url);
        if let Err(e) = self.url_service.update_url_html(url_obj.id, &html).await {
            // Log error but continue
            println!("WARNING: Failed to update URL HTML content: {}", e);
        }

        // Step 4: Update URL with markdown content
        println!("Updating URL markdown content in database for URL: {}", url);
        if let Err(e) = self
            .url_service
            .update_url_markdown(url_obj.id, Some(markdown.clone()), None, UrlStatus::Crawled)
            .await
        {
            // Log error but continue
            println!("WARNING: Failed to update URL markdown content: {}", e);
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

        // Check if URL should be skipped based on anti-patterns
        if !self.should_crawl_url(url, prefix_path, anti_paths, anti_keywords) {
            println!("URL matches anti-patterns, skipping: {}", url);

            // Emit progress update
            let _ = self.event_emitter().emit_task_updated(
                task_id, 100, // 100% progress - completed (skipped)
                "skipped",
            );

            // Mark URL as skipped in database and clear any content
            match self
                .url_service
                .get_url_by_url(technology_id, version_id, url)
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

                    println!("Marked URL as skipped: {}", url);
                }
                _ => {} // URL not in database yet, nothing to update
            }

            // Mark as processed in memory to prevent future attempts
            if skip_processed {
                self.mark_url_processed(url);
            }

            return Ok(());
        }

        // Emit progress update
        let _ = self.event_emitter().emit_task_updated(
            task_id, 30, // 30% progress - crawling
            "crawling",
        );

        // First crawl the URL to fetch its content
        let html = match self.crawl_url(technology_id, version_id, url).await {
            Ok(_) => {
                // Get the URL record with the HTML content
                match self
                    .url_service
                    .get_url_by_url(technology_id, version_id, url)
                    .await
                {
                    Ok(Some(url_record)) => {
                        if let Some(html_content) = url_record.html {
                            html_content
                        } else {
                            println!("WARNING: URL record has no HTML content: {}", url);
                            // Mark as processed anyway to avoid getting stuck
                            if skip_processed {
                                self.mark_url_processed(url);
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
                        println!("WARNING: Failed to get URL record after crawling: {}", url);
                        // Mark as processed anyway to avoid getting stuck
                        if skip_processed {
                            self.mark_url_processed(url);
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
                            url, e
                        );
                        // Mark as processed anyway to avoid getting stuck
                        if skip_processed {
                            self.mark_url_processed(url);
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
                println!("ERROR: Failed to crawl URL {}: {}", url, e);
                // Mark as processed anyway to avoid getting stuck
                if skip_processed {
                    self.mark_url_processed(url);
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

        // Extract links from HTML
        let links = self.extract_links_from_html(&html, url);
        println!("Found {} links on {}", links.len(), url);

        // Filter links by prefix
        let mut valid_links = Vec::new();
        for link in links {
            // Skip self-references
            if link == url {
                continue;
            }

            // Apply filter
            if self.should_crawl_url(&link, prefix_path, anti_paths, anti_keywords) {
                valid_links.push(link);
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
            // Check if already in database with any status
            let in_database = matches!(
                self.url_service
                    .get_url_by_url(technology_id, version_id, &link)
                    .await,
                Ok(Some(_))
            );

            // Check if already processed in memory
            let already_processed = if skip_processed {
                self.is_url_processed(&link) || in_database
            } else {
                in_database
            };

            if !already_processed {
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

                        // Mark as processed if needed
                        if skip_processed {
                            self.mark_url_processed(&link);
                        }
                    }
                    Err(e) => {
                        println!("Error adding URL to database: {}", e);
                    }
                }
            }
        }

        // Emit progress update (completed)
        let _ = self.event_emitter().emit_task_updated(
            task_id,
            100, // 100% progress - completed
            "completed",
        );

        println!("Added {} new URLs to queue from {}", added_count, url);
        println!("======== END PROCESSING URL: {} ========", url);
        Ok(())
    }
}
