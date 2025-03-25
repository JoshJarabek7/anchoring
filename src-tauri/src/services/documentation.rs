use crate::db::models::{DocumentationSnippet, Technology, TechnologyVersion, UrlStatus};
use crate::db::repositories::documentation::DocumentationRepository;
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

        // Verify embedding is f32 before storage
        println!("Verifying embedding before storage:");
        println!("  - Embedding length: {}", embedding.len());
        if !embedding.is_empty() {
            let first_val = embedding[0];
            let size_of_val = std::mem::size_of_val(&first_val);
            println!(
                "  - Type verification: {} bytes (should be 4 for f32)",
                size_of_val
            );
            println!(
                "  - First few values: {:?}",
                &embedding[..3.min(embedding.len())]
            );
        }

        // Final explicit cast to ensure f32
        let embedding: Vec<f32> = embedding
            .into_iter()
            .map(|v| v as f32) // Explicit cast to f32
            .collect();

        // Store snippet and embedding
        self.repository
            .add_snippet_with_embedding(&snippet, &embedding)
            .await
            .map_err(|e| format!("Error adding snippet with embedding: {}", e))
    }

    /// Get all snippets for a specific version
    pub async fn get_snippets_for_version(
        &self,
        version_id: &Uuid,
    ) -> Result<Vec<DocumentationSnippet>, String> {
        use crate::db::get_pg_connection;
        use crate::db::models::DocumentationSnippet;
        use diesel::prelude::*;
        use diesel::sql_query;

        println!(
            "DocumentationService: get_snippets_for_version called with UUID: {}",
            version_id
        );

        // Create a query to get all snippets for the version
        let query = "
            SELECT 
                s.id, 
                s.title, 
                s.description, 
                s.content, 
                s.source_url, 
                s.technology_id, 
                s.version_id, 
                s.concepts, 
                s.created_at, 
                s.updated_at
            FROM 
                documentation_snippets s
            WHERE 
                s.version_id = $1
            ORDER BY 
                s.title ASC
        ";

        let version_uuid = *version_id;

        println!("DocumentationService: Executing SQL to fetch snippets");

        // Execute query in a blocking thread
        tokio::task::spawn_blocking(move || -> Result<Vec<DocumentationSnippet>, String> {
            let mut conn = match get_pg_connection() {
                Ok(conn) => conn,
                Err(e) => {
                    println!("DocumentationService: Failed to connect to database: {}", e);
                    return Err(format!("Failed to connect to database: {}", e));
                }
            };

            let result = sql_query(query)
                .bind::<diesel::sql_types::Uuid, _>(version_uuid)
                .load::<DocumentationSnippet>(&mut conn);

            match result {
                Ok(snippets) => {
                    println!(
                        "DocumentationService: Successfully loaded {} snippets from database",
                        snippets.len()
                    );
                    Ok(snippets)
                }
                Err(e) => {
                    println!(
                        "DocumentationService: Error fetching snippets from database: {}",
                        e
                    );
                    Err(format!("Error fetching snippets: {}", e))
                }
            }
        })
        .await
        .map_err(|e| {
            println!("DocumentationService: Task join error: {}", e);
            format!("Task join error: {}", e)
        })?
    }

    /// Get a single snippet by ID
    pub async fn get_snippet_by_id(
        &self,
        snippet_id: &Uuid,
    ) -> Result<Option<DocumentationSnippet>, String> {
        use crate::db::get_pg_connection;
        use crate::db::models::DocumentationSnippet;
        use diesel::prelude::*;
        use diesel::sql_query;

        // Create a query to get the specific snippet
        let query = "
            SELECT 
                s.id, 
                s.title, 
                s.description, 
                s.content, 
                s.source_url, 
                s.technology_id, 
                s.version_id, 
                s.concepts, 
                s.created_at, 
                s.updated_at
            FROM 
                documentation_snippets s
            WHERE 
                s.id = $1
        ";

        let uuid = *snippet_id;

        // Execute query in a blocking thread
        let snippets =
            tokio::task::spawn_blocking(move || -> Result<Vec<DocumentationSnippet>, String> {
                let mut conn = match get_pg_connection() {
                    Ok(conn) => conn,
                    Err(e) => return Err(format!("Failed to connect to database: {}", e)),
                };

                sql_query(query)
                    .bind::<diesel::sql_types::Uuid, _>(uuid)
                    .load::<DocumentationSnippet>(&mut conn)
                    .map_err(|e| format!("Error fetching snippet: {}", e))
            })
            .await
            .map_err(|e| format!("Task join error: {}", e))??;

        // Return the first result, if any
        Ok(snippets.into_iter().next())
    }

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

    /// Get all unique concepts from documentation snippets
    pub async fn get_all_concepts(&self) -> Result<Vec<String>, String> {
        use crate::db::get_pg_connection;
        use diesel::prelude::*;
        use diesel::sql_query;
        use diesel::sql_types::Text;

        println!("DocumentationService: get_all_concepts called");

        // SQL query to extract all unique concepts
        let query = "
            SELECT DISTINCT unnest(concepts) as concept
            FROM documentation_snippets
            WHERE concepts IS NOT NULL
            ORDER BY concept
        ";

        #[derive(QueryableByName, Debug)]
        struct ConceptResult {
            #[diesel(sql_type = Text)]
            concept: String,
        }

        println!("DocumentationService: Executing SQL to fetch concepts");

        // Execute the query
        let concepts = tokio::task::spawn_blocking(move || -> Result<Vec<String>, String> {
            let mut conn = match get_pg_connection() {
                Ok(conn) => conn,
                Err(e) => {
                    println!(
                        "DocumentationService: Failed to connect to database for concepts: {}",
                        e
                    );
                    return Err(format!("Failed to connect to database: {}", e));
                }
            };

            let results: Vec<ConceptResult> = match sql_query(query).load(&mut conn) {
                Ok(r) => r,
                Err(e) => {
                    println!("DocumentationService: Error querying concepts: {}", e);
                    return Err(format!("Error querying concepts: {}", e));
                }
            };

            let concept_strings = results
                .into_iter()
                .map(|r| r.concept)
                .collect::<Vec<String>>();
            println!(
                "DocumentationService: Found {} unique concepts",
                concept_strings.len()
            );
            Ok(concept_strings)
        })
        .await
        .map_err(|e| {
            println!(
                "DocumentationService: Task join error in concepts fetch: {}",
                e
            );
            format!("Task join error: {}", e)
        })??;

        Ok(concepts)
    }

    /// Search snippets using vector search with pagination
    pub async fn search_snippets_by_vector(
        &self,
        query: &str,
        pagination: Option<crate::db::repositories::PaginationParams>,
        filter: Option<&str>,
        version_id: Option<&uuid::Uuid>,
    ) -> Result<crate::db::pgvector::PaginatedSearchResults, String> {
        use crate::db::pgvector;
        use crate::services::get_services;
        use crate::services::intelligence::{EmbeddingModel, ModelType};

        println!("DocumentationService: search_snippets_by_vector called with query: '{}', pagination: {:?}, filter: {:?}, version_id: {:?}", 
            query, pagination, filter, version_id);

        // Quick check for empty query
        if query.trim().is_empty() {
            println!("DocumentationService: Empty query, returning empty results");
            return Ok(pgvector::PaginatedSearchResults {
                results: Vec::new(),
                total_count: 0,
                page: pagination.as_ref().map(|p| p.page).unwrap_or(1),
                per_page: pagination.as_ref().map(|p| p.per_page).unwrap_or(10),
                total_pages: 0,
            });
        }

        // Generate an embedding for the search query
        println!("DocumentationService: Generating embedding for query");
        let intelligence_service = &get_services().intelligence;
        let embedding = intelligence_service
            .create_embedding(
                None,
                ModelType::Embedding(EmbeddingModel::TextEmbedding3Large),
                query.to_string(),
            )
            .await;

        println!(
            "DocumentationService: Generated embedding with {} dimensions",
            embedding.len()
        );

        // Perform the vector search using pgvector
        println!("DocumentationService: Performing vector search");
        let result =
            pgvector::vector_search_snippets_paginated(&embedding, pagination, filter, version_id)
                .await;

        match &result {
            Ok(results) => println!(
                "DocumentationService: Vector search successful, found {} results",
                results.results.len()
            ),
            Err(err) => println!("DocumentationService: Vector search failed: {}", err),
        }

        result.map_err(|e| format!("Error in vector search: {}", e))
    }
}
