use crate::db::repositories::PaginationParams;
use crate::db::schema::documentation_embeddings;
use crate::db::{get_pg_connection, DbError};
use diesel::prelude::*;
use diesel::sql_types::{Float4, Nullable, Text};
use diesel::QueryableByName;
use pgvector::Vector;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, QueryableByName)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    #[diesel(sql_type = Text)]
    pub id: String,
    #[diesel(sql_type = Float4)]
    pub similarity: f32,
    #[diesel(sql_type = Text)]
    pub content: String,
    #[diesel(sql_type = Text)]
    pub metadata: String,
    // Fields for better context
    #[diesel(sql_type = Text)]
    pub technology_name: String,
    #[diesel(sql_type = Nullable<Text>)]
    pub technology_language: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    pub technology_related: Option<String>,
    #[diesel(sql_type = Text)]
    pub version: String,
    #[diesel(sql_type = Text)]
    pub source_url: String,
    #[diesel(sql_type = Text)]
    pub title: String,
    #[diesel(sql_type = Text)]
    pub description: String,
    #[diesel(sql_type = Nullable<Text>)]
    pub concepts: Option<String>,
}

/// Search result with pagination metadata
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedSearchResults {
    pub results: Vec<SearchResult>,
    pub total_count: i64,
    pub page: i64,
    pub per_page: i64,
    pub total_pages: i64,
}

/// Add an embedding to documentation_embeddings
pub async fn add_embedding(snippet_id: &uuid::Uuid, embedding: &[f32]) -> Result<(), DbError> {
    // Validate the embedding dimensions
    if embedding.is_empty() {
        return Err(DbError::PgVectorError("Empty embedding vector".to_string()));
    }

    // Use tokio to avoid blocking the async runtime
    let snippet_id = *snippet_id;
    let embedding = embedding.to_vec();

    tokio::task::spawn_blocking(move || {
        let mut conn = get_pg_connection()?;

        // Convert embedding to pgvector format
        let vector = Vector::from(embedding);

        // Run within a transaction
        conn.transaction(|conn| {
            // First, try to delete any existing embedding for this snippet_id
            diesel::delete(documentation_embeddings::table)
                .filter(documentation_embeddings::snippet_id.eq(snippet_id))
                .execute(conn)
                .map_err(|e| {
                    DbError::PgVectorError(format!("Failed to delete existing embedding: {}", e))
                })?;

            // Then insert new embedding
            diesel::sql_query(
                "INSERT INTO documentation_embeddings (id, snippet_id, embedding, created_at) 
                 VALUES ($1, $2, $3, NOW())",
            )
            .bind::<diesel::sql_types::Uuid, _>(Uuid::new_v4())
            .bind::<diesel::sql_types::Uuid, _>(snippet_id)
            .bind::<pgvector::sql_types::Vector, _>(vector)
            .execute(conn)
            .map_err(|e| DbError::PgVectorError(format!("Failed to add embedding: {}", e)))?;

            Ok(())
        })
    })
    .await
    .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
}

/// Search for similar embeddings with pagination support
pub async fn vector_search_snippets_paginated(
    query_embedding: &[f32],
    pagination: Option<PaginationParams>,
    filter: Option<&str>,
    version_id: Option<&uuid::Uuid>,
) -> Result<PaginatedSearchResults, DbError> {
    // Validate the embedding dimensions
    if query_embedding.is_empty() {
        return Err(DbError::PgVectorError("Empty query vector".to_string()));
    }

    let query_embedding = query_embedding.to_vec();
    let filter_str = filter.map(String::from);
    let version_id_copy = version_id.cloned();
    let pagination = pagination.unwrap_or_default();

    tokio::task::spawn_blocking(move || {
        let mut conn = get_pg_connection()?;

        // Convert query embedding to pgvector format
        let query_vector = Vector::from(query_embedding);

        // First, get the total count for pagination
        let count_sql = build_count_query(&filter_str, &version_id_copy)?;

        let count_result = diesel::sql_query(&count_sql)
            .load::<CountResult>(&mut conn)
            .map_err(|e| DbError::PgVectorError(format!("Failed to get total count: {}", e)))?;

        let total_count = if let Some(result) = count_result.first() {
            result.count
        } else {
            0
        };

        // Then get the results for the current page
        let query_sql = build_search_query(&filter_str, &version_id_copy, &pagination)?;

        let results = diesel::sql_query(&query_sql)
            .bind::<pgvector::sql_types::Vector, _>(query_vector)
            .bind::<diesel::sql_types::BigInt, _>(
                ((pagination.page - 1) * pagination.per_page) as i64,
            )
            .bind::<diesel::sql_types::BigInt, _>(pagination.per_page)
            .load::<SearchResult>(&mut conn)
            .map_err(|e| DbError::PgVectorError(format!("Failed to search embeddings: {}", e)))?;

        // Calculate total pages
        let total_pages = (total_count as f64 / pagination.per_page as f64).ceil() as i64;

        Ok(PaginatedSearchResults {
            results,
            total_count,
            page: pagination.page,
            per_page: pagination.per_page,
            total_pages,
        })
    })
    .await
    .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
}

/// Legacy function for backward compatibility
pub async fn vector_search_snippets(
    query_embedding: &[f32],
    limit: usize,
    filter: Option<&str>,
    version_id: Option<&uuid::Uuid>,
) -> Result<Vec<SearchResult>, DbError> {
    let pagination = PaginationParams {
        page: 1,
        per_page: limit as i64,
    };

    let results =
        vector_search_snippets_paginated(query_embedding, Some(pagination), filter, version_id)
            .await?;

    Ok(results.results)
}

/// Delete an embedding
pub async fn delete_embedding(id: &uuid::Uuid) -> Result<bool, DbError> {
    let id = *id;

    tokio::task::spawn_blocking(move || -> Result<bool, DbError> {
        let mut conn = get_pg_connection()?;

        // Use explicit conversion to handle error typing
        let result = diesel::delete(documentation_embeddings::table)
            .filter(documentation_embeddings::snippet_id.eq(id))
            .execute(&mut conn);

        let rows_affected = match result {
            Ok(rows) => rows,
            Err(e) => {
                return Err(DbError::PgVectorError(format!(
                    "Failed to delete embedding: {}",
                    e
                )))
            }
        };

        Ok(rows_affected > 0)
    })
    .await
    .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
}

// Helper function to build the count query
fn build_count_query(
    filter: &Option<String>,
    version_id: &Option<Uuid>,
) -> Result<String, DbError> {
    let mut count_sql = String::from(
        "SELECT COUNT(*) as count FROM documentation_embeddings e
         JOIN documentation_snippets s ON e.snippet_id = s.id
         JOIN technologies t ON s.technology_id = t.id
         JOIN technology_versions tv ON s.version_id = tv.id",
    );

    // Add filter if provided
    if let Some(filter_condition) = filter {
        count_sql.push_str(&format!(" WHERE {}", filter_condition));
    } else if let Some(ver_id) = version_id {
        count_sql.push_str(&format!(" WHERE s.version_id = '{}'", ver_id));
    }

    Ok(count_sql)
}

// Define a struct to capture count result
#[derive(QueryableByName, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CountResult {
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    count: i64,
}

// Helper function to build the search query
fn build_search_query(
    filter: &Option<String>,
    version_id: &Option<Uuid>,
    pagination: &PaginationParams,
) -> Result<String, DbError> {
    let mut query_sql = String::from(
        "SELECT 
            s.id::text as id, 
            e.embedding <-> $1 as similarity, 
            s.content as content,
            json_build_object(
                'title', s.title, 
                'description', s.description,
                'technology_id', s.technology_id,
                'version_id', s.version_id,
                'source_url', s.source_url,
                'concepts', s.concepts
            )::text as metadata,
            t.name as technology_name,
            t.language as technology_language,
            array_to_string(t.related, ', ') as technology_related,
            tv.version as version,
            s.source_url as source_url,
            s.title as title,
            s.description as description,
            array_to_string(s.concepts, ', ') as concepts
         FROM documentation_embeddings e
         JOIN documentation_snippets s ON e.snippet_id = s.id
         JOIN technologies t ON s.technology_id = t.id
         JOIN technology_versions tv ON s.version_id = tv.id",
    );

    // Add filter if provided
    if let Some(filter_condition) = filter {
        query_sql.push_str(&format!(" WHERE {}", filter_condition));
    } else if let Some(ver_id) = version_id {
        query_sql.push_str(&format!(" WHERE s.version_id = '{}'", ver_id));
    }

    // Add order by and pagination
    query_sql.push_str(" ORDER BY similarity ASC OFFSET $2 LIMIT $3");

    Ok(query_sql)
}
