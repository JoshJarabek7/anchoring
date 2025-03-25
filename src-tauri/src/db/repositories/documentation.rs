use crate::db::models::DocumentationSnippet;
use crate::db::pgvector;
use crate::db::repositories::Repository;
use crate::db::schema::documentation_snippets;
use crate::db::DbError;
// use crate::impl_repository;
use diesel::prelude::*;

#[derive(Debug)]
pub struct DocumentationRepository;

impl DocumentationRepository {
    pub fn new() -> Self {
        Self {}
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
