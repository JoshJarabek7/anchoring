use crate::db::models::CrawlingSettings;
use crate::db::models::{DocumentationUrl, Proxy, Technology, TechnologyVersion};
use crate::services::{crawler::CrawlConfig, get_services, Task, TaskPayload};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
// Proxy Commands

#[tauri::command(rename_all = "camelCase")]
pub async fn get_proxies() -> Result<Vec<Proxy>, String> {
    get_services().proxies.get_proxies().await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn fetch_and_save_proxies() -> Result<Vec<Proxy>, String> {
    get_services().proxies.fetch_and_save_proxies().await
}

// Technology Commands

#[tauri::command(rename_all = "camelCase")]
pub async fn get_technologies() -> Result<Vec<Technology>, String> {
    get_services().technologies.get_technologies().await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_technology_versions(
    technology_id: Uuid,
) -> Result<Vec<TechnologyVersion>, String> {
    get_services()
        .versions
        .get_versions_for_technology(technology_id)
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_technology(
    name: String,
    language: Option<String>,
) -> Result<Technology, String> {
    get_services()
        .technologies
        .create_technology(&Technology {
            id: Uuid::new_v4(),
            name,
            language,
            related: None,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        })
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn create_technology_version(
    technology_id: Uuid,
    version: String,
) -> Result<TechnologyVersion, String> {
    // Create the version
    let created_version = get_services()
        .versions
        .create_version(&TechnologyVersion {
            id: Uuid::new_v4(),
            technology_id,
            version,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        })
        .await?;

    // Create default crawling settings for this version
    get_services()
        .crawler
        .get_or_create_default_settings(created_version.id)
        .await?;

    Ok(created_version)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_technology(technology_id: Uuid) -> Result<bool, String> {
    get_services()
        .technologies
        .delete_technology(technology_id)
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_technology_version(version_id: Uuid) -> Result<bool, String> {
    get_services().versions.delete_version(version_id).await
}

// Documentation URL

#[tauri::command(rename_all = "camelCase")]
pub async fn add_documentation_url(
    url: String,
    technology_id: Uuid,
    version_id: Uuid,
) -> Result<DocumentationUrl, String> {
    // Get the crawling settings to check filters
    let settings = match get_services()
        .crawler
        .get_crawling_settings_for_version(version_id)
        .await?
    {
        Some(s) => s,
        None => return Err("No crawling settings found for this version".to_string()),
    };

    // Parse anti-paths and anti-keywords from settings
    let anti_paths = settings
        .anti_paths
        .map(|paths| paths.split(',').map(String::from).collect::<Vec<String>>())
        .unwrap_or_default();

    let anti_keywords = settings
        .anti_keywords
        .map(|keywords| {
            println!("Splitting raw anti_keywords: '{}'", keywords);
            keywords
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    // Get the prefix path
    let prefix_path = settings.prefix_path.unwrap_or_default();

    // Check if URL passes all filters
    let should_add =
        get_services()
            .crawler
            .should_crawl_url(&url, &prefix_path, &anti_paths, &anti_keywords);

    if !should_add {
        return Err(format!(
            "URL '{}' matches exclusion filters and cannot be added",
            url
        ));
    }

    // Add URL if it passes the filters
    get_services()
        .documentation_urls
        .add_url(&url, technology_id, version_id)
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_version_documentation_urls(
    version_id: Uuid,
    include_content: bool,
) -> Result<Vec<DocumentationUrl>, String> {
    get_services()
        .documentation_urls
        .get_urls_for_version(version_id, include_content)
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_full_documentation_url(url_id: Uuid) -> Result<Option<DocumentationUrl>, String> {
    get_services()
        .documentation_urls
        .get_url_by_id(url_id)
        .await
}

// Crawling Settings

#[tauri::command(rename_all = "camelCase")]
pub async fn get_version_crawling_settings(version_id: Uuid) -> Result<CrawlingSettings, String> {
    println!("Fetching crawling settings for version ID: {}", version_id);

    // Always use get_or_create_default to ensure settings exist
    get_services()
        .crawler
        .get_or_create_default_settings(version_id)
        .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_version_crawling_settings(
    crawling_settings_id: Option<Uuid>,
    version_id: Uuid,
    prefix_path: Option<String>,
    anti_paths: Option<String>,
    anti_keywords: Option<String>,
) -> Result<CrawlingSettings, String> {
    let settings_id = match crawling_settings_id {
        Some(id) => id,
        None => {
            // Check if settings already exist for this version
            let existing = get_services()
                .crawler
                .get_crawling_settings_for_version(version_id)
                .await?;

            match existing {
                Some(settings) => settings.id,
                None => Uuid::new_v4(), // Generate a new UUID if no settings exist
            }
        }
    };

    get_services()
        .crawler
        .save_crawling_settings(CrawlingSettings {
            id: settings_id,
            version_id,
            prefix_path,
            anti_paths,
            anti_keywords,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        })
        .await
}

// Crawling Commands

#[tauri::command(rename_all = "camelCase")]
pub async fn start_crawling(
    app: AppHandle,
    technology_id: Uuid,
    version_id: Uuid,
    start_url: String,
    prefix_path: String,
    anti_paths: Option<Vec<String>>,
    anti_keywords: Option<Vec<String>>,
    skip_processed_urls: Option<bool>,
    on_event: tauri::ipc::Channel<CrawlEvent>,
) -> Result<String, String> {
    // Create configuration
    let config = CrawlConfig {
        technology_id,
        version_id,
        start_url: start_url.clone(),
        prefix_path,
        anti_paths,
        anti_keywords,
        skip_processed_urls,
    };

    // Emit event that crawling started
    app.emit("crawl-started", &start_url).unwrap();

    // Start crawling with the configuration
    let task_id = get_services().crawler.start_crawling(config).await?;

    // Set up emit to the channel
    on_event
        .send(CrawlEvent::Started {
            task_id: task_id.clone(),
            url: start_url,
        })
        .unwrap();

    Ok(task_id)
}

// Event types for Channel API
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum CrawlEvent {
    Started { task_id: String, url: String },
}

#[tauri::command(rename_all = "camelCase")]
pub async fn apply_url_filters(version_id: Uuid) -> Result<usize, String> {
    println!("Starting apply_url_filters for version: {}", version_id);

    // Get the current crawling settings
    let settings = get_services()
        .crawler
        .get_crawling_settings_for_version(version_id)
        .await?;

    if settings.is_none() {
        println!("No crawling settings found for version: {}", version_id);
        return Err("No crawling settings found for this version".to_string());
    }

    let settings = settings.unwrap();
    println!(
        "Found settings: prefix_path={:?}, anti_paths={:?}, anti_keywords={:?}",
        settings.prefix_path, settings.anti_paths, settings.anti_keywords
    );

    // Output raw anti_keywords string for debugging
    if let Some(raw_keywords) = &settings.anti_keywords {
        println!("Raw anti_keywords string from DB: '{}'", raw_keywords);
    } else {
        println!("Raw anti_keywords string from DB: None");
    }

    // Parse anti-paths and anti-keywords from settings
    let anti_paths = settings
        .anti_paths
        .map(|paths| paths.split(',').map(String::from).collect::<Vec<String>>())
        .unwrap_or_default();

    let anti_keywords = settings
        .anti_keywords
        .map(|keywords| {
            println!("Splitting raw anti_keywords: '{}'", keywords);
            keywords
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    println!(
        "DEBUG: Parsed anti_paths ({}): {:?}",
        anti_paths.len(),
        anti_paths
    );
    println!(
        "DEBUG: Parsed anti_keywords ({}): {:?}",
        anti_keywords.len(),
        anti_keywords
    );

    // Get the prefix path from settings
    let prefix_path = settings.prefix_path.unwrap_or_default();
    println!("Using prefix_path: '{}'", prefix_path);

    // Check if there are any filtering patterns defined
    if anti_paths.is_empty() && anti_keywords.is_empty() && prefix_path.is_empty() {
        println!("DEBUG: No filtering criteria defined, nothing to filter");
        return Ok(0);
    }

    // Get URLs for this version
    let urls = get_services()
        .documentation_urls
        .get_urls_for_version(version_id, false)
        .await?;

    println!("Found {} URLs for filtering", urls.len());

    // Store the total count before urls is moved
    let total_urls = urls.len();

    // Use atomic counters for thread-safe updates
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    let deleted_count = Arc::new(AtomicUsize::new(0));
    let checked_count = Arc::new(AtomicUsize::new(0));
    let skipped_count = Arc::new(AtomicUsize::new(0));

    // Create a single task for URL filtering instead of one per batch
    let task_payload = TaskPayload {
        url: format!("Apply Filters ({} URLs)", total_urls),
        prefix_path: prefix_path.clone(),
        anti_paths: anti_paths.clone(),
        anti_keywords: anti_keywords.clone(),
        skip_processed: false,
        url_id: Uuid::nil(), // Not relevant for this task
    };

    // Create a single task with a more descriptive name
    let task = Task::new("apply_url_filters", Some(version_id), None, task_payload);

    // Submit the task to the worker pool
    let task_id = get_services().worker_pool.queue_task(task).await?;

    // Create batches of URLs to process in parallel
    let batch_size = std::cmp::min(100, std::cmp::max(10, total_urls / 10));
    println!(
        "Processing URLs in batches of {} (total: {})",
        batch_size, total_urls
    );

    let mut url_batches = Vec::new();
    let mut current_batch = Vec::new();

    // Split URLs into batches
    for url in urls {
        current_batch.push(url);

        if current_batch.len() >= batch_size {
            url_batches.push(std::mem::take(&mut current_batch));
        }
    }

    // Add any remaining URLs as the final batch
    if !current_batch.is_empty() {
        url_batches.push(current_batch);
    }

    println!(
        "Created {} URL batches for parallel processing",
        url_batches.len()
    );

    // Initial progress update
    let _ = get_services()
        .event_emitter
        .emit_task_updated(&task_id, 0, "running");

    // Use a vector to hold all batch processing tasks
    let mut batch_tasks = Vec::new();

    // Process each batch in parallel but track as part of the same task
    for (batch_idx, batch) in url_batches.into_iter().enumerate() {
        let local_deleted_count = deleted_count.clone();
        let local_checked_count = checked_count.clone();
        let local_skipped_count = skipped_count.clone();
        let anti_paths = anti_paths.clone();
        let anti_keywords = anti_keywords.clone();
        let prefix_path = prefix_path.clone();
        let task_id = task_id.clone();
        let total_urls = total_urls;

        // Spawn a task to process this batch
        let task = tauri::async_runtime::spawn(async move {
            println!(
                "Processing batch {} with {} URLs",
                batch_idx + 1,
                batch.len()
            );

            // Process each URL in the batch
            for url in batch {
                let current_checked = local_checked_count.fetch_add(1, Ordering::SeqCst) + 1;

                // Update progress every 10 URLs or so
                if current_checked % 10 == 0 || current_checked == total_urls {
                    let progress = ((current_checked as f64 / total_urls as f64) * 100.0) as i32;
                    let _ = get_services()
                        .event_emitter
                        .emit_task_updated(&task_id, progress, "running");
                }

                // Skip URLs that are already marked as skipped
                if url.get_status() == crate::db::models::UrlStatus::Skipped {
                    local_skipped_count.fetch_add(1, Ordering::SeqCst);
                    continue;
                }

                // Check if URL passes all filters
                let should_crawl = get_services().crawler.should_crawl_url(
                    &url.url,
                    &prefix_path,
                    &anti_paths,
                    &anti_keywords,
                );

                // Log results every 50 URLs to avoid spamming the console
                if current_checked % 50 == 0 {
                    println!(
                        "Checked {} URLs so far, {} deleted",
                        current_checked,
                        local_deleted_count.load(Ordering::SeqCst)
                    );
                }

                if !should_crawl {
                    // Delete URL
                    match get_services().documentation_urls.delete_url(url.id).await {
                        Ok(()) => {
                            let new_count = local_deleted_count.fetch_add(1, Ordering::SeqCst) + 1;

                            // Log every 10 deletions
                            if new_count % 10 == 0 {
                                println!("Deleted {} URLs so far", new_count);
                            }
                        }
                        Err(e) => {
                            println!("Error deleting URL {}: {}", url.url, e);
                        }
                    }
                }
            }

            println!("Completed batch {} processing", batch_idx + 1);
        });

        batch_tasks.push(task);
    }

    // Wait for all batch tasks to complete
    for task in batch_tasks {
        let _ = task.await;
    }

    // Get final counts
    let final_checked = checked_count.load(Ordering::SeqCst);
    let final_skipped = skipped_count.load(Ordering::SeqCst);
    let final_deleted = deleted_count.load(Ordering::SeqCst);

    println!(
        "Finished filtering. Stats: checked={}, skipped={}, deleted={}",
        final_checked, final_skipped, final_deleted
    );

    // Mark the task as completed
    let _ = get_services().event_emitter.emit_task_updated(
        &task_id,
        100, // 100% progress
        "completed",
    );

    // Emit notification about URLs deleted
    let notification_message = if final_deleted > 0 {
        format!(
            "Deleted {} URLs that matched filter criteria",
            final_deleted
        )
    } else {
        "No URLs were deleted. All URLs match the current filters.".to_string()
    };

    // Always emit a notification so users know the operation completed
    let _ = get_services().event_emitter.emit_app_notification(
        "URL Filters Applied",
        &notification_message,
        Some(if final_deleted > 0 { "info" } else { "success" }),
    );

    Ok(final_deleted)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stop_all_crawling() -> Result<(), String> {
    get_services().crawler.stop_all_crawling()
}

#[tauri::command(rename_all = "camelCase")]
pub async fn stop_tech_version_crawling(
    technology_id: Uuid,
    version_id: Uuid,
) -> Result<(), String> {
    get_services()
        .crawler
        .stop_tech_version_crawling(technology_id, version_id)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn clean_markdown(
    _app: tauri::AppHandle,
    url_ids: Vec<Uuid>,
    on_event: tauri::ipc::Channel<MarkdownEvent>,
) -> Result<Vec<String>, String> {
    if url_ids.is_empty() {
        return Err("No URLs selected".to_string());
    }

    // Start event
    match on_event.send(MarkdownEvent::Started {
        url_count: url_ids.len(),
    }) {
        Ok(_) => (),
        Err(e) => return Err(format!("Error sending start event: {}", e)),
    }

    let services = get_services();
    let mut task_ids = Vec::new();

    // BATCH PROCESSING: Process URLs in small batches to avoid rate limiting
    const BATCH_SIZE: usize = 5;
    const BATCH_DELAY_MS: u64 = 1000; // 1 second delay between batches

    let batches = url_ids.chunks(BATCH_SIZE);
    let total_batches = (url_ids.len() as f32 / BATCH_SIZE as f32).ceil() as usize;

    for (batch_index, batch) in batches.enumerate() {
        // Send progress update about starting new batch
        if let Err(e) = on_event.send(MarkdownEvent::Progress {
            current: batch_index * BATCH_SIZE,
            total: url_ids.len(),
            url: format!("Processing batch {}/{}", batch_index + 1, total_batches),
        }) {
            eprintln!("Error sending progress event: {}", e);
        }

        // Process each URL in the current batch with retry logic
        for (i, &url_id) in batch.iter().enumerate() {
            let current_index = batch_index * BATCH_SIZE + i;

            // Get the URL details
            let url_result = services.documentation_urls.get_url_by_id(url_id).await;

            match url_result {
                Ok(Some(url)) => {
                    // Check if we have markdown or HTML content to clean
                    // IMPORTANT: Allow URLs with error status to be processed if they have content
                    if url.markdown.is_some() || url.html.is_some() {
                        // Send progress event
                        if let Err(e) = on_event.send(MarkdownEvent::Progress {
                            current: current_index,
                            total: url_ids.len(),
                            url: url.url.clone(),
                        }) {
                            eprintln!("Error sending progress event: {}", e);
                        }

                        // Create the task payload
                        let payload = TaskPayload {
                            url: url.url.clone(),
                            prefix_path: String::new(),
                            anti_paths: Vec::new(),
                            anti_keywords: Vec::new(),
                            skip_processed: false,
                            url_id,
                        };

                        // Create the task
                        let task = Task::new(
                            "clean_markdown",
                            Some(url.technology_id),
                            Some(url.version_id),
                            payload,
                        );

                        // Submit task with retry logic
                        const MAX_RETRIES: usize = 3;
                        let mut retry_count = 0;
                        let mut last_error = None;

                        // Retry loop for rate limits
                        loop {
                            match services.worker_pool.queue_task(task.clone()).await {
                                Ok(task_id) => {
                                    task_ids.push(task_id);
                                    break;
                                }
                                Err(e) => {
                                    // Only retry for rate limit errors
                                    if e.contains("rate limit") && retry_count < MAX_RETRIES {
                                        retry_count += 1;
                                        let delay = std::time::Duration::from_millis(
                                            (2_u64.pow(retry_count as u32)) * 1000,
                                        );

                                        // Send progress event about retrying
                                        if let Err(e) = on_event.send(MarkdownEvent::Progress {
                                            current: current_index,
                                            total: url_ids.len(),
                                            url: format!(
                                                "Rate limited, retrying in {}s: {}",
                                                delay.as_secs(),
                                                url.url
                                            ),
                                        }) {
                                            eprintln!("Error sending retry event: {}", e);
                                        }

                                        // Wait before retrying
                                        tokio::time::sleep(delay).await;
                                    } else {
                                        // Non-rate limit error or max retries reached
                                        last_error = Some(e);
                                        break;
                                    }
                                }
                            }
                        }

                        // Report final error if all retries failed
                        if let Some(error) = last_error {
                            eprintln!("Failed to queue task after retries: {}", error);
                            if let Err(e) = on_event.send(MarkdownEvent::Error {
                                message: format!("Failed to process URL after retries: {}", error),
                            }) {
                                eprintln!("Error sending error event: {}", e);
                            }
                        }
                    } else {
                        // No content available
                        if let Err(e) = on_event.send(MarkdownEvent::Progress {
                            current: current_index,
                            total: url_ids.len(),
                            url: format!("Skipping (no content): {}", url.url),
                        }) {
                            eprintln!("Error sending progress event: {}", e);
                        }
                    }
                }
                Ok(None) => {
                    // URL not found
                    if let Err(e) = on_event.send(MarkdownEvent::Error {
                        message: format!("URL with ID {} not found", url_id),
                    }) {
                        eprintln!("Error sending error event: {}", e);
                    }
                }
                Err(e) => {
                    // Error fetching URL
                    if let Err(e) = on_event.send(MarkdownEvent::Error {
                        message: format!("Error fetching URL: {}", e),
                    }) {
                        eprintln!("Error sending error event: {}", e);
                    }
                }
            }
        }

        // Add delay between batches to avoid rate limiting
        if batch_index < total_batches - 1 {
            tokio::time::sleep(std::time::Duration::from_millis(BATCH_DELAY_MS)).await;
        }
    }

    // Send finished event
    if let Err(e) = on_event.send(MarkdownEvent::Finished {
        task_ids: task_ids.clone(),
    }) {
        eprintln!("Error sending finished event: {}", e);
    }

    Ok(task_ids)
}

// Event types for Channel API
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum MarkdownEvent {
    Started {
        url_count: usize,
    },
    Progress {
        current: usize,
        total: usize,
        url: String,
    },
    Finished {
        task_ids: Vec<String>,
    },
    Error {
        message: String,
    },
}

#[tauri::command(rename_all = "camelCase")]
pub async fn generate_snippets(
    _app: tauri::AppHandle, // Prefix with _ to indicate intentionally unused
    url_ids: Vec<Uuid>,
    on_event: tauri::ipc::Channel<SnippetEvent>,
) -> Result<Vec<String>, String> {
    // Get services
    let services = get_services();
    let mut task_ids = Vec::new();

    // Send started event through channel only (no toast)
    on_event
        .send(SnippetEvent::Started {
            url_count: url_ids.len(),
        })
        .unwrap();

    // Create batches of URLs to process in parallel
    let batch_size = std::cmp::min(5, std::cmp::max(1, url_ids.len() / 4));
    let mut url_batches = Vec::new();
    let mut current_batch = Vec::new();

    for url_id in url_ids {
        current_batch.push(url_id);
        if current_batch.len() >= batch_size {
            url_batches.push(std::mem::take(&mut current_batch));
        }
    }
    if !current_batch.is_empty() {
        url_batches.push(current_batch);
    }

    let total_batches = url_batches.len(); // Store length before moving

    // Process each batch as a background task
    for (batch_idx, batch) in url_batches.into_iter().enumerate() {
        let task_payload = TaskPayload {
            url: format!("Snippets Batch {} ({} URLs)", batch_idx + 1, batch.len()),
            prefix_path: String::new(),
            anti_paths: Vec::new(),
            anti_keywords: Vec::new(),
            skip_processed: false,
            url_id: batch[0], // Use first URL ID for reference
        };

        // Create task for this batch
        let task = Task::new("generate_snippets_batch", None, None, task_payload);

        // Queue the task
        let task_id = services.worker_pool.queue_task(task).await?;
        task_ids.push(task_id);

        // Process the batch in the background
        let batch_urls = batch.clone();
        let channel = on_event.clone();

        tauri::async_runtime::spawn(async move {
            for (url_idx, url_id) in batch_urls.iter().enumerate() {
                // Get documentation URL and related info
                if let Ok(Some(doc_url)) = services.documentation_urls.get_url_by_id(*url_id).await
                {
                    // Update progress through channel (no toast)
                    channel
                        .send(SnippetEvent::Progress {
                            current: batch_idx * batch_size + url_idx,
                            total: total_batches * batch_size,
                            url: doc_url.url.clone(),
                        })
                        .unwrap_or_default();

                    // Get technology and version info
                    if let Ok((tech, ver)) = services
                        .documentation_urls
                        .get_tech_and_version_for_url(*url_id)
                        .await
                    {
                        // Process URL into snippets
                        let _ = services
                            .documentation
                            .process_url_to_snippets_with_progress(*url_id, &tech, &ver, None)
                            .await;
                    }
                }
            }
        });
    }

    // Send finished event through channel
    on_event
        .send(SnippetEvent::Finished {
            task_ids: task_ids.clone(),
        })
        .unwrap();

    Ok(task_ids)
}

// Event types for Channel API
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum SnippetEvent {
    Started {
        url_count: usize,
    },
    Progress {
        current: usize,
        total: usize,
        url: String,
    },
    Finished {
        task_ids: Vec<String>,
    },
    Error {
        message: String,
    },
}

#[tauri::command]
pub async fn get_snippet_concepts() -> Result<Vec<String>, String> {
    get_services().documentation.get_all_concepts().await
}

#[tauri::command]
pub async fn vector_search_snippets(
    query: String,
    page: Option<i64>,
    per_page: Option<i64>,
    filter: Option<String>,
    version_id: Option<String>,
    global_search: Option<bool>,
) -> Result<crate::db::pgvector::PaginatedSearchResults, String> {
    use uuid::Uuid;

    println!("Backend: vector_search_snippets called with query: '{}', page: {:?}, per_page: {:?}, filter: {:?}, version_id: {:?}, global_search: {:?}", 
        query, page, per_page, filter, version_id, global_search);

    let version_uuid = match version_id {
        Some(id) => {
            if !global_search.unwrap_or(false) {
                // Convert string to UUID if provided and not in global search mode
                match Uuid::parse_str(&id) {
                    Ok(uuid) => {
                        println!("Backend: Using version_id: {}", uuid);
                        Some(uuid)
                    }
                    Err(_) => {
                        println!("Backend: Invalid version UUID format: {}", id);
                        None
                    }
                }
            } else {
                println!("Backend: Global search enabled, ignoring version_id");
                None
            }
        }
        None => {
            println!("Backend: No version_id provided");
            None
        }
    };

    // Set up pagination
    let pagination = match (page, per_page) {
        (Some(p), Some(pp)) => Some(crate::db::repositories::PaginationParams {
            page: p,
            per_page: pp,
        }),
        (Some(p), None) => Some(crate::db::repositories::PaginationParams {
            page: p,
            per_page: 10, // Default per_page
        }),
        (None, Some(pp)) => Some(crate::db::repositories::PaginationParams {
            page: 1, // Default page
            per_page: pp,
        }),
        (None, None) => None,
    };

    println!("Backend: Using pagination: {:?}", pagination);

    let result = get_services()
        .documentation
        .search_snippets_by_vector(&query, pagination, filter.as_deref(), version_uuid.as_ref())
        .await;

    match &result {
        Ok(results) => println!(
            "Backend: Vector search returned {} results",
            results.results.len()
        ),
        Err(err) => println!("Backend: Vector search error: {}", err),
    }

    result
}

#[tauri::command]
pub async fn get_documentation_snippets(
    version_id: String,
) -> Result<Vec<crate::db::models::DocumentationSnippet>, String> {
    println!(
        "Backend: get_documentation_snippets called with version_id: {}",
        version_id
    );

    // Parse the version ID
    let version_uuid = match uuid::Uuid::parse_str(&version_id) {
        Ok(uuid) => uuid,
        Err(_) => {
            println!("Backend: Invalid version ID format: {}", version_id);
            return Err("Invalid version ID format".to_string());
        }
    };

    // Use the existing services
    match get_services()
        .documentation
        .get_snippets_for_version(&version_uuid)
        .await
    {
        Ok(snippets) => {
            println!(
                "Backend: Successfully fetched {} snippets for version {}",
                snippets.len(),
                version_id
            );
            Ok(snippets)
        }
        Err(err) => {
            println!("Backend: Error fetching snippets: {}", err);
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn get_documentation_snippet(
    snippet_id: String,
) -> Result<Option<crate::db::models::DocumentationSnippet>, String> {
    // Parse the snippet ID
    let uuid = match uuid::Uuid::parse_str(&snippet_id) {
        Ok(uuid) => uuid,
        Err(_) => return Err("Invalid snippet ID format".to_string()),
    };

    // Use the existing services
    get_services().documentation.get_snippet_by_id(&uuid).await
}
