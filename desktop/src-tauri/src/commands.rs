use crate::db::models::CrawlingSettings;
use crate::db::models::{DocumentationUrl, Proxy, Technology, TechnologyVersion};
use crate::services::{crawler::CrawlConfig, get_services};
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
    get_services()
        .versions
        .create_version(&TechnologyVersion {
            id: Uuid::new_v4(),
            technology_id,
            version,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        })
        .await
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

    // We'll use the repository's get_or_create_default function
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
    Started {
        task_id: String,
        url: String,
    },
    Progress {
        url_count: usize,
        processed_count: usize,
    },
    UrlDiscovered {
        url: String,
    },
    Finished {
        task_id: String,
        total_urls: usize,
    },
    Error {
        message: String,
    },
}

#[tauri::command(rename_all = "camelCase")]
pub async fn apply_url_filters(version_id: Uuid) -> Result<usize, String> {
    // Get the current crawling settings
    let settings = get_services()
        .crawler
        .get_crawling_settings_for_version(version_id)
        .await?;

    if settings.is_none() {
        return Err("No crawling settings found for this version".to_string());
    }

    let settings = settings.unwrap();

    // Parse anti-paths and anti-keywords from settings
    let anti_paths = settings
        .anti_paths
        .map(|paths| paths.split(',').map(String::from).collect::<Vec<String>>())
        .unwrap_or_default();

    let anti_keywords = settings
        .anti_keywords
        .map(|keywords| {
            keywords
                .split(',')
                .map(String::from)
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    // Get the prefix path from settings
    let prefix_path = settings.prefix_path.unwrap_or_default();

    // Apply filters to all URLs for this version
    let urls = get_services()
        .documentation_urls
        .get_urls_for_version(version_id, false)
        .await?;

    let mut skipped_count = 0;

    for url in urls {
        // Skip URLs that are already marked as skipped
        if url.get_status() == crate::db::models::UrlStatus::Skipped {
            continue;
        }

        // Check if URL should be skipped based on settings
        if !get_services().crawler.should_crawl_url(
            &url.url,
            &prefix_path,
            &anti_paths,
            &anti_keywords,
        ) {
            // Update URL status to skipped
            match get_services()
                .documentation_urls
                .update_url_status(url.id, crate::db::models::UrlStatus::Skipped)
                .await
            {
                Ok(_) => {
                    skipped_count += 1;
                    // Emit event for UI update
                    let _ = get_services()
                        .event_emitter
                        .emit_url_status_updated(&url.id, "skipped");
                }
                Err(e) => {
                    println!("Error updating URL status to skipped: {}", e);
                }
            }
        }
    }

    // Emit notification about URLs marked as skipped
    let notification_message = if skipped_count > 0 {
        format!("Marked {} URLs as skipped based on filters", skipped_count)
    } else {
        "No URLs were skipped. All URLs match the current filters.".to_string()
    };

    // Always emit a notification so users know the operation completed
    let _ = get_services().event_emitter.emit_app_notification(
        "URL Filters Applied",
        &notification_message,
        Some(if skipped_count > 0 { "info" } else { "success" }),
    );

    Ok(skipped_count)
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
    app: tauri::AppHandle,
    url_ids: Vec<Uuid>,
    on_event: tauri::ipc::Channel<MarkdownEvent>,
) -> Result<Vec<String>, String> {
    // Get services
    let services = get_services();

    // Send started event through channel
    on_event
        .send(MarkdownEvent::Started {
            url_count: url_ids.len(),
        })
        .unwrap();

    // Emit global event that process started
    app.emit("markdown-cleaning-started", url_ids.len())
        .unwrap();

    let mut task_ids = Vec::new();

    for (index, url_id) in url_ids.iter().enumerate() {
        // Get documentation URL
        let doc_url = match services.documentation_urls.get_url_by_id(*url_id).await {
            Ok(Some(url)) => url,
            Ok(None) => {
                on_event
                    .send(MarkdownEvent::Error {
                        message: format!("URL with ID {} not found", url_id),
                    })
                    .unwrap();
                continue;
            }
            Err(e) => {
                on_event
                    .send(MarkdownEvent::Error {
                        message: format!("Error retrieving URL {}: {}", url_id, e),
                    })
                    .unwrap();
                continue;
            }
        };

        // Update progress through channel
        on_event
            .send(MarkdownEvent::Progress {
                current: index,
                total: url_ids.len(),
                url: doc_url.url.clone(),
            })
            .unwrap();

        // Create a task ID for tracking
        let task_id = Uuid::new_v4().to_string();

        // For the markdown cleaning, we'll need to use the documentation_urls service directly
        // Get content (either HTML or markdown)
        let content = if let Some(markdown) = &doc_url.markdown {
            markdown.clone()
        } else if let Some(html) = &doc_url.html {
            // Convert HTML to markdown if needed
            match services.crawler.convert_html_to_markdown(&html) {
                Ok(md) => md,
                Err(e) => {
                    on_event
                        .send(MarkdownEvent::Error {
                            message: format!("Error converting HTML to markdown: {}", e),
                        })
                        .unwrap();
                    continue;
                }
            }
        } else {
            on_event
                .send(MarkdownEvent::Error {
                    message: format!("URL {} has no content to clean", url_id),
                })
                .unwrap();
            continue;
        };

        // Clean the markdown
        match services.intelligence.cleanup_markdown(&content).await {
            Ok(cleaned_markdown) => {
                // Update the URL with cleaned markdown
                match services
                    .documentation_urls
                    .update_url_cleaned_markdown(*url_id, &cleaned_markdown)
                    .await
                {
                    Ok(_) => {
                        // Update URL status
                        let _ = services
                            .documentation_urls
                            .update_url_status(*url_id, crate::db::models::UrlStatus::MarkdownReady)
                            .await;

                        // Add task ID to results
                        task_ids.push(task_id);
                    }
                    Err(e) => {
                        on_event
                            .send(MarkdownEvent::Error {
                                message: format!("Error saving cleaned markdown: {}", e),
                            })
                            .unwrap();
                    }
                }
            }
            Err(e) => {
                on_event
                    .send(MarkdownEvent::Error {
                        message: format!("Error cleaning markdown: {}", e),
                    })
                    .unwrap();
            }
        }
    }

    // Send finished event through channel
    on_event
        .send(MarkdownEvent::Finished {
            task_ids: task_ids.clone(),
        })
        .unwrap();

    // Emit global event that process completed
    app.emit("markdown-cleaning-completed", task_ids.len())
        .unwrap();

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
    app: tauri::AppHandle,
    url_ids: Vec<Uuid>,
    on_event: tauri::ipc::Channel<SnippetEvent>,
) -> Result<Vec<String>, String> {
    // Get services
    let services = get_services();

    // Send started event through channel
    on_event
        .send(SnippetEvent::Started {
            url_count: url_ids.len(),
        })
        .unwrap();

    // Emit global event that process started
    app.emit("snippet-generation-started", url_ids.len())
        .unwrap();

    let mut task_ids = Vec::new();

    for (index, url_id) in url_ids.iter().enumerate() {
        // Get documentation URL
        let doc_url = match services.documentation_urls.get_url_by_id(*url_id).await {
            Ok(Some(url)) => url,
            Ok(None) => {
                on_event
                    .send(SnippetEvent::Error {
                        message: format!("URL with ID {} not found", url_id),
                    })
                    .unwrap();
                continue;
            }
            Err(e) => {
                on_event
                    .send(SnippetEvent::Error {
                        message: format!("Error retrieving URL {}: {}", url_id, e),
                    })
                    .unwrap();
                continue;
            }
        };

        // Update progress through channel
        on_event
            .send(SnippetEvent::Progress {
                current: index,
                total: url_ids.len(),
                url: doc_url.url.clone(),
            })
            .unwrap();

        // Create a task ID for tracking
        let task_id = Uuid::new_v4().to_string();

        // Generate snippets
        // We need to get the cleaned markdown content
        let markdown = if let Some(cleaned_md) = &doc_url.cleaned_markdown {
            cleaned_md.clone()
        } else if let Some(md) = &doc_url.markdown {
            md.clone()
        } else {
            on_event
                .send(SnippetEvent::Error {
                    message: format!("URL {} has no markdown content", url_id),
                })
                .unwrap();
            continue;
        };

        // Generate snippets using the intelligence service
        match services.intelligence.generate_snippets(&markdown).await {
            Ok(_) => {
                // We're just tracking that the operation completed
                // Actual snippet storage would happen within the generate_snippets method
                task_ids.push(task_id);
            }
            Err(e) => {
                on_event
                    .send(SnippetEvent::Error {
                        message: format!("Error generating snippets: {}", e),
                    })
                    .unwrap();
            }
        }
    }

    // Send finished event through channel
    on_event
        .send(SnippetEvent::Finished {
            task_ids: task_ids.clone(),
        })
        .unwrap();

    // Emit global event that process completed
    app.emit("snippet-generation-completed", task_ids.len())
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
