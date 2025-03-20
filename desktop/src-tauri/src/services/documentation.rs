use crate::db::models::{
    DocumentationSnippet, Technology, TechnologyVersion, UrlStatus,
};
use crate::db::pgvector::{self, SearchResult};
use crate::db::repositories::documentation::DocumentationRepository;
use crate::db::repositories::Repository;
use crate::services::get_services;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Service for managing documentation
///
/// This service provides a high-level interface for managing documentation operations:
/// - Creating and managing documentation snippets
/// - Searching documentation
/// - Processing markdown content into snippets
/// - Managing embeddings for vector search

#[derive(Debug)]
pub struct DocumentationService {
    repository: DocumentationRepository,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub query: String,
    pub technology_id: Option<String>,
    pub version_id: Option<String>,
    pub limit: Option<usize>,
}

impl Default for DocumentationService {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentationService {
    pub fn new() -> Self {
        Self {
            repository: DocumentationRepository::new(),
        }
    }

    // /// Get all documentation snippets
    // pub async fn get_snippets(&self) -> Result<Vec<DocumentationSnippet>, String> {
    //     self.repository
    //         .get_all()
    //         .await
    //         .map_err(|e| format!("Error fetching snippets: {}", e))
    // }

    // /// Get a snippet by ID
    // pub async fn get_snippet(&self, id: Uuid) -> Result<Option<DocumentationSnippet>, String> {
    //     self.repository
    //         .get_by_id(id)
    //         .await
    //         .map_err(|e| format!("Error fetching snippet: {}", e))
    // }

    /// Create a new snippet with embedding
    pub async fn add_snippet(&self, snippet: DocumentationSnippet) -> Result<Uuid, String> {
        // Get the IntelligenceService
        let intelligence = &get_services().intelligence;

        // Generate embedding for the snippet content
        let text_for_embedding = format!(
            "Title: {}\nDescription: {}\nContent: {}",
            snippet.title, snippet.description, snippet.content
        );

        let embedding = intelligence
            .create_embedding(
                None,
                crate::services::intelligence::ModelType::Embedding(
                    crate::services::intelligence::EmbeddingModel::TextEmbedding3Large,
                ),
                text_for_embedding,
            )
            .await;

        // Store snippet and embedding
        self.repository
            .add_snippet_with_embedding(&snippet, &embedding)
            .await
            .map_err(|e| format!("Error adding snippet with embedding: {}", e))
    }

    // /// Update an existing snippet with embedding
    // pub async fn update_snippet(
    //     &self,
    //     snippet: DocumentationSnippet,
    // ) -> Result<DocumentationSnippet, String> {
    //     // Get the IntelligenceService
    //     let intelligence = &get_services().intelligence;

    //     // Generate embedding for the snippet content
    //     let text_for_embedding = format!(
    //         "Title: {}\nDescription: {}\nContent: {}",
    //         snippet.title, snippet.description, snippet.content
    //     );

    //     let embedding = intelligence
    //         .create_embedding(
    //             None,
    //             crate::services::intelligence::ModelType::Embedding(
    //                 crate::services::intelligence::EmbeddingModel::TextEmbedding3Large,
    //             ),
    //             text_for_embedding,
    //         )
    //         .await;

    //     // Update snippet and embedding
    //     self.repository
    //         .update_snippet_with_embedding(&snippet, &embedding)
    //         .await
    //         .map_err(|e| format!("Error updating snippet with embedding: {}", e))
    // }

    /// Delete a snippet
    // pub async fn delete_snippet(&self, id: Uuid) -> Result<bool, String> {
    //     self.repository
    //         .delete_snippet_with_embedding(&id)
    //         .await
    //         .map_err(|e| format!("Error deleting snippet: {}", e))
    // }

    // /// Get snippets for a technology
    // pub async fn get_snippets_for_technology(
    //     &self,
    //     technology_id: Uuid,
    // ) -> Result<Vec<DocumentationSnippet>, String> {
    //     self.repository
    //         .get_by_technology(technology_id)
    //         .await
    //         .map_err(|e| format!("Error fetching snippets for technology: {}", e))
    // }

    // /// Get snippets for a version
    // pub async fn get_snippets_for_version(
    //     &self,
    //     version_id: Uuid,
    // ) -> Result<Vec<DocumentationSnippet>, String> {
    //     self.repository
    //         .get_by_version(version_id)
    //         .await
    //         .map_err(|e| format!("Error fetching snippets for version: {}", e))
    // }

    // /// Get snippet count for a URL
    // pub async fn get_snippet_count_for_url(&self, url: &str) -> Result<i64, String> {
    //     self.repository
    //         .get_snippet_count_for_url(url)
    //         .await
    //         .map_err(|e| format!("Error fetching snippet count for URL: {}", e))
    // }

    // /// Process a URL into snippets
    // pub async fn process_url_to_snippets(
    //     &self,
    //     url_id: Uuid,
    //     technology: &Technology,
    //     version: &TechnologyVersion,
    // ) -> Result<Vec<Uuid>, String> {
    //     // Use the progress-aware version with no progress helper
    //     self.process_url_to_snippets_with_progress(url_id, technology, version, None)
    //         .await
    // }

    /// Process a URL into snippets with progress updates
    /// This version accepts an optional progress helper that will receive progress updates
    pub async fn process_url_to_snippets_with_progress(
        &self,
        url_id: Uuid,
        technology: &Technology,
        version: &TechnologyVersion,
        progress_helper: Option<&crate::services::DocumentationServiceHelper>,
    ) -> Result<Vec<Uuid>, String> {
        // Get required services
        let url_service = &get_services().documentation_urls;
        let intelligence = &get_services().intelligence;

        // Update progress if helper is available
        if let Some(helper) = progress_helper {
            helper.emit_progress(60, "retrieving_url_content")?;
        }

        // Get URL information
        let url_info = match url_service.get_url_by_id(url_id).await? {
            Some(url) => url,
            None => return Err(format!("URL with ID {} not found", url_id)),
        };

        // Get markdown content (convert from HTML if needed)
        let markdown = if let Some(markdown) = url_info.markdown {
            markdown
        } else if let Some(html) = url_info.html {
            // Convert HTML to markdown
            get_services().crawler.convert_html_to_markdown(&html)?
        } else {
            return Err("No content available to process".to_string());
        };

        // Update URL status to processing
        url_service
            .update_url_status(url_id, UrlStatus::Processing)
            .await?;

        // Update progress if helper is available
        if let Some(helper) = progress_helper {
            helper.emit_progress(65, "generating_snippets")?;
        }

        // Process markdown into snippets using the IntelligenceService
        let snippets = match intelligence.generate_snippets(&markdown).await {
            Ok(snippet_json) => snippet_json,
            Err(e) => {
                url_service
                    .update_url_status(url_id, UrlStatus::ProcessingError)
                    .await?;
                return Err(e);
            }
        };

        // Update progress if helper is available
        if let Some(helper) = progress_helper {
            helper.emit_progress(80, "storing_snippets")?;
        }

        // Convert JSON snippets to DocumentationSnippet objects
        let mut snippet_ids = Vec::new();
        let snippet_count = snippets.len();
        let mut processed_count = 0;

        for snippet_json in snippets {
            // Extract snippet fields from JSON
            let title = snippet_json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let description = snippet_json
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let content = snippet_json
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Skip snippets with empty content
            if content.is_empty() {
                println!("Warning: Empty content for snippet, skipping");
                continue;
            }

            // Extract concepts as strings
            let concepts = if let Some(concepts_array) =
                snippet_json.get("concepts").and_then(|v| v.as_array())
            {
                let mut concept_list = Vec::new();
                for concept in concepts_array {
                    if let Some(concept_str) = concept.as_str() {
                        concept_list.push(Some(concept_str.to_string()));
                    }
                }
                Some(concept_list)
            } else {
                None
            };

            // Create and store the snippet
            let snippet = DocumentationSnippet {
                id: Uuid::new_v4(),
                title,
                description,
                content,
                source_url: url_info.url.clone(),
                technology_id: technology.id,
                version_id: version.id,
                concepts,
                created_at: chrono::Utc::now().naive_utc(),
                updated_at: chrono::Utc::now().naive_utc(),
            };

            // Add snippet with embedding (generates embedding automatically)
            match self.add_snippet(snippet).await {
                Ok(id) => snippet_ids.push(id),
                Err(e) => println!("Warning: Failed to add snippet: {}", e),
            }

            // Update snippet processing progress
            processed_count += 1;
            if let Some(helper) = progress_helper {
                let overall_progress =
                    80 + ((processed_count as f32 / snippet_count as f32) * 20.0) as i32;
                if overall_progress < 100 {
                    helper.emit_progress(overall_progress, "storing_snippets")?;
                }
            }
        }

        // Update URL status to processed
        url_service
            .update_url_status(url_id, UrlStatus::Processed)
            .await?;

        // Update final progress if helper is available
        if let Some(helper) = progress_helper {
            helper.emit_progress(100, "snippets_generated")?;
        }

        // Return IDs of created snippets
        Ok(snippet_ids)
    }

    // /// Search for documentation using vector similarity
    // pub async fn search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
    //     // Get the IntelligenceService
    //     let intelligence = &get_services().intelligence;

    //     // Generate embedding for the search query
    //     let query_embedding = intelligence
    //         .create_embedding(
    //             None,
    //             crate::services::intelligence::ModelType::Embedding(
    //                 crate::services::intelligence::EmbeddingModel::TextEmbedding3Large,
    //             ),
    //             query.query.clone(),
    //         )
    //         .await;

    //     // Build filter string based on parameters
    //     let mut filter_parts = Vec::new();

    //     if let Some(tech_id) = &query.technology_id {
    //         filter_parts.push(format!("s.technology_id = '{}'", tech_id));
    //     }

    //     if let Some(version_id) = &query.version_id {
    //         filter_parts.push(format!("s.version_id = '{}'", version_id));
    //     }

    //     let filter = if filter_parts.is_empty() {
    //         None
    //     } else {
    //         Some(filter_parts.join(" AND "))
    //     };

    //     // Use limit or default to 10
    //     let limit = query.limit.unwrap_or(10);

    //     // Perform vector search
    //     pgvector::vector_search_snippets(&query_embedding, limit, filter.as_deref(), None)
    //         .await
    //         .map_err(|e| format!("Error searching snippets: {}", e))
    // }

    // /// Clean markdown for a URL
    // pub async fn clean_markdown(&self, url_id: Uuid) -> Result<String, String> {
    //     // Get the URL to process
    //     let url = match get_services()
    //         .documentation_urls
    //         .get_url_by_id(url_id)
    //         .await
    //     {
    //         Ok(Some(url)) => url,
    //         Ok(None) => return Err(format!("URL with ID {} not found", url_id)),
    //         Err(e) => return Err(format!("Error fetching URL: {}", e)),
    //     };

    //     // Check if URL has HTML or markdown content
    //     if url.html.is_none() && url.markdown.is_none() {
    //         return Err(format!("URL {} has no content to clean", url_id));
    //     }

    //     // Get markdown content (convert from HTML if needed)
    //     let markdown = if let Some(markdown) = url.markdown {
    //         markdown
    //     } else if let Some(html) = url.html {
    //         // Convert HTML to markdown
    //         get_services().crawler.convert_html_to_markdown(&html)?
    //     } else {
    //         return Err("No content available to process".to_string());
    //     };

    //     // Clean the markdown
    //     let cleaned_markdown = get_services()
    //         .intelligence
    //         .cleanup_markdown(&markdown)
    //         .await?;

    //     // Update the URL with cleaned markdown
    //     let _ = get_services()
    //         .documentation_urls
    //         .update_url_markdown(
    //             url_id,
    //             Some(markdown.clone()),
    //             Some(cleaned_markdown.clone()),
    //             UrlStatus::MarkdownReady,
    //         )
    //         .await?;

    //     // Return task ID for tracking
    //     let task_id = Uuid::new_v4().to_string();
    //     Ok(task_id)
    // }
}
