use crate::db::models::DocumentationSnippet;
use crate::db::pgvector;
use crate::db::repositories::Repository;
use crate::db::schema::documentation_snippets;
use crate::db::{get_pg_connection, DbError};
// use crate::impl_repository;
use diesel::prelude::*;

#[derive(Debug)]
pub struct DocumentationRepository;

impl DocumentationRepository {
    pub fn new() -> Self {
        Self {}
    }

    // Additional specialized methods for the repository

    /// Get snippets by technology ID
    pub async fn get_by_technology(
        &self,
        technology_id: uuid::Uuid,
    ) -> Result<Vec<DocumentationSnippet>, DbError> {
        let tech_id = technology_id;

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            documentation_snippets::table
                .filter(documentation_snippets::technology_id.eq(tech_id))
                .order(documentation_snippets::created_at.desc())
                .load::<DocumentationSnippet>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Get snippets by version ID
    pub async fn get_by_version(
        &self,
        version_id: uuid::Uuid,
    ) -> Result<Vec<DocumentationSnippet>, DbError> {
        let ver_id = version_id;

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            documentation_snippets::table
                .filter(documentation_snippets::version_id.eq(ver_id))
                .order(documentation_snippets::created_at.desc())
                .load::<DocumentationSnippet>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Get snippets by source URL
    pub async fn get_by_source_url(&self, url: &str) -> Result<Vec<DocumentationSnippet>, DbError> {
        let url = url.to_string();

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            documentation_snippets::table
                .filter(documentation_snippets::source_url.eq(url))
                .order(documentation_snippets::created_at.desc())
                .load::<DocumentationSnippet>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Get snippet count for a URL
    pub async fn get_snippet_count_for_url(&self, url: &str) -> Result<i64, DbError> {
        let url = url.to_string();

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            documentation_snippets::table
                .filter(documentation_snippets::source_url.eq(url))
                .count()
                .get_result::<i64>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Store a snippet along with its embedding for vector search
    pub async fn add_snippet_with_embedding(
        &self,
        snippet: &DocumentationSnippet,
        embedding: &[f32],
    ) -> Result<uuid::Uuid, DbError> {
        // First, store the snippet in the relational database
        let snippet_id = snippet.id;
        self.create(snippet).await?;

        // Then, store the embedding in the vector database
        self.store_embedding(&snippet_id, embedding).await?;

        Ok(snippet_id)
    }

    /// Update a snippet and its embedding
    pub async fn update_snippet_with_embedding(
        &self,
        snippet: &DocumentationSnippet,
        embedding: &[f32],
    ) -> Result<DocumentationSnippet, DbError> {
        // Update the snippet in the relational database
        let id = snippet.id;
        let updated_snippet = self.update(id, snippet).await?;

        // Update or create the embedding
        self.store_embedding(&id, embedding).await?;

        Ok(updated_snippet)
    }

    /// Delete a snippet and its embedding
    pub async fn delete_snippet_with_embedding(
        &self,
        snippet_id: &uuid::Uuid,
    ) -> Result<bool, DbError> {
        // First check if the snippet exists
        if let Ok(Some(_)) = self.get_by_id(*snippet_id).await {
            // Delete from the relational database - this will cascade delete the embedding due to foreign key
            self.delete(*snippet_id).await?;

            // Delete any orphaned embeddings just to be sure
            match pgvector::delete_embedding(snippet_id).await {
                Ok(_) => (),
                Err(e) => println!(
                    "Warning: Failed to delete embedding for snippet {}: {}",
                    snippet_id, e
                ),
            }

            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Store an embedding for a snippet
    async fn store_embedding(
        &self,
        snippet_id: &uuid::Uuid,
        embedding: &[f32],
    ) -> Result<(), DbError> {
        // Store the embedding using pgvector's add_embedding function
        pgvector::add_embedding(snippet_id, embedding).await
    }
}

// Use the repository macro to implement common CRUD operations
crate::impl_repository!(
    DocumentationRepository,
    DocumentationSnippet,
    uuid::Uuid,
    documentation_snippets::table,
    documentation_snippets::id
);

pub async fn get_documentation_snippet(
    snippet_id: &uuid::Uuid,
) -> Result<Option<DocumentationSnippet>, DbError> {
    DocumentationRepository::new().get_by_id(*snippet_id).await
}

pub async fn get_documentation_snippets() -> Result<Vec<DocumentationSnippet>, DbError> {
    let repo = DocumentationRepository::new();
    repo.get_all().await
}

/// Add a documentation snippet with its embedding
pub async fn add_documentation_snippet_with_embedding(
    snippet: &DocumentationSnippet,
    embedding: &[f32],
) -> Result<uuid::Uuid, DbError> {
    DocumentationRepository::new()
        .add_snippet_with_embedding(snippet, embedding)
        .await
}

/// Update a documentation snippet with its embedding
pub async fn update_documentation_snippet_with_embedding(
    snippet: &DocumentationSnippet,
    embedding: &[f32],
) -> Result<DocumentationSnippet, DbError> {
    DocumentationRepository::new()
        .update_snippet_with_embedding(snippet, embedding)
        .await
}

/// Delete a documentation snippet and its embedding
pub async fn delete_documentation_snippet_with_embedding(
    snippet_id: &uuid::Uuid,
) -> Result<bool, DbError> {
    DocumentationRepository::new()
        .delete_snippet_with_embedding(snippet_id)
        .await
}
