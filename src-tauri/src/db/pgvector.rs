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

    println!("Storing embedding for snippet {}", snippet_id);
    println!("  - Embedding length: {}", embedding.len());
    if !embedding.is_empty() {
        println!(
            "  - First 3 values: {:?}",
            &embedding.iter().take(3).collect::<Vec<_>>()
        );
    }

    // Use tokio to avoid blocking the async runtime
    let snippet_id = *snippet_id;

    // Create a copy with explicit f32 casting to ensure type consistency
    let embedding: Vec<f32> = embedding
        .iter()
        .map(|&x| x as f32) // Force explicit cast to f32, even if already f32
        .collect();

    tokio::task::spawn_blocking(move || {
        let mut conn = get_pg_connection()?;

        // Log type verification before Vector creation
        if !embedding.is_empty() {
            let first_val = embedding[0];
            let size_of_val = std::mem::size_of_val(&first_val);
            let type_name = std::any::type_name::<f32>();
            println!("Type verification before storing Vector:");
            println!("  - Type name: {}", type_name);
            println!("  - Size of value: {} bytes", size_of_val);
            println!("  - First value: {}", first_val);
            println!("  - Is 4 bytes (f32): {}", size_of_val == 4);
            println!("  - Memory representation: {:?}", first_val.to_le_bytes());
        }

        // Create Vector element by element to ensure f32 type
        let vector_values: Vec<f32> = embedding
            .iter()
            .map(|&x| {
                // Force f32 conversion more explicitly
                let val_f32: f32 = x;
                val_f32
            })
            .collect();
        // Now create Vector from the explicitly typed Vec<f32>
        let vector = Vector::from(vector_values);
        println!("Successfully created Vector object for storage");

        // Run within a transaction
        conn.transaction(|conn| {
            // First, try to delete any existing embedding for this snippet_id
            diesel::delete(documentation_embeddings::table)
                .filter(documentation_embeddings::snippet_id.eq(snippet_id))
                .execute(conn)
                .map_err(|e| {
                    DbError::PgVectorError(format!("Failed to delete existing embedding: {}", e))
                })?;

            // Then insert new embedding with explicit float4 type
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
    // Log more detailed information about the input
    println!("Starting vector_search_snippets_paginated with:");
    println!("  - Embedding length: {}", query_embedding.len());
    println!(
        "  - First 3 values: {:?}",
        &query_embedding.iter().take(3).collect::<Vec<_>>()
    );
    println!("  - Version ID: {:?}", version_id);

    // Validate the embedding dimensions
    if query_embedding.is_empty() {
        return Err(DbError::PgVectorError("Empty query vector".to_string()));
    }

    // Create a copy of the embedding explicitly as f32
    let query_embedding: Vec<f32> = query_embedding
        .iter()
        .map(|&x| x as f32) // Force explicit cast to f32, even if already f32
        .collect();

    println!(
        "Vector search with embedding size: {}, first value: {}",
        query_embedding.len(),
        query_embedding.first().unwrap_or(&0.0)
    );

    let filter_str = filter.map(String::from);
    let version_id_copy = version_id.cloned();
    let pagination = pagination.unwrap_or_default();

    tokio::task::spawn_blocking(move || {
        let mut conn = get_pg_connection()?;

        // Create pgvector Vector directly from the f32 values
        println!("Creating Vector from {} f32 values", query_embedding.len());

        // Log some debug info to verify type
        if !query_embedding.is_empty() {
            let first_val = query_embedding[0];
            // Verify it's f32 by checking the size
            let size_of_val = std::mem::size_of_val(&first_val);
            let type_name = std::any::type_name::<f32>();
            println!("Type verification before Vector creation:");
            println!("  - Type name: {}", type_name);
            println!("  - Size of value: {} bytes", size_of_val);
            println!("  - First value: {}", first_val);
            println!("  - Is 4 bytes (f32): {}", size_of_val == 4);
            println!("  - Memory representation: {:?}", first_val.to_le_bytes());
        }

        // Create Vector element by element to ensure f32 type
        let vector_values: Vec<f32> = query_embedding
            .iter()
            .map(|&x| {
                // Force f32 conversion more explicitly
                let val_f32: f32 = x;
                val_f32
            })
            .collect();
        // Now create Vector from the explicitly typed Vec<f32>
        let query_vector = Vector::from(vector_values);
        println!("Successfully created Vector object");

        // First, get the total count for pagination
        let count_sql = build_count_query(&filter_str, &version_id_copy)?;
        println!("Count SQL: {}", count_sql);

        let count_result = diesel::sql_query(&count_sql)
            .load::<CountResult>(&mut conn)
            .map_err(|e| DbError::PgVectorError(format!("Failed to get total count: {}", e)))?;

        let total_count = if let Some(result) = count_result.first() {
            result.count
        } else {
            0
        };
        println!("Total count: {}", total_count);

        // Then get the results for the current page
        let query_sql = build_search_query(&filter_str, &version_id_copy)?;
        println!("Search SQL: {}", query_sql);

        println!("Executing vector search query...");

        // The SQL query now has explicit type casting in build_search_query,
        // so no replacements needed
        let modified_query_sql = query_sql;

        // Calculate pagination offset
        let offset = (pagination.page - 1) * pagination.per_page;
        println!(
            "Pagination: page={}, per_page={}, offset={}",
            pagination.page, pagination.per_page, offset
        );

        // Explicitly separate and type each binding to avoid potential order issues
        let results = diesel::sql_query(&modified_query_sql)
            // First param is the vector
            .bind::<pgvector::sql_types::Vector, _>(query_vector)
            // Second param is the offset (zero-based)
            .bind::<diesel::sql_types::BigInt, _>(offset)
            // Third param is the limit
            .bind::<diesel::sql_types::BigInt, _>(pagination.per_page)
            .load::<SearchResult>(&mut conn)
            .map_err(|e| {
                println!("Search error: {}", e);
                DbError::PgVectorError(format!("Failed to search embeddings: {}", e))
            })?;
        println!("Search returned {} results", results.len());

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

/// Delete an embedding
// This function is not used currently and can be removed to avoid warnings
// pub async fn delete_embedding(id: &uuid::Uuid) -> Result<bool, DbError> {
//    let id = *id;
//
//    tokio::task::spawn_blocking(move || -> Result<bool, DbError> {
//        let mut conn = get_pg_connection()?;
//
//        // Use explicit conversion to handle error typing
//        let result = diesel::delete(documentation_embeddings::table)
//            .filter(documentation_embeddings::snippet_id.eq(id))
//            .execute(&mut conn);
//
//        let rows_affected = match result {
//            Ok(rows) => rows,
//            Err(e) => {
//                return Err(DbError::PgVectorError(format!(
//                    "Failed to delete embedding: {}",
//                    e
//                )))
//            }
//        };
//
//        Ok(rows_affected > 0)
//    })
//    .await
//    .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
// }

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
) -> Result<String, DbError> {
    let mut query_sql = String::from(
        "SELECT 
            s.id::text as id, 
            (e.embedding::vector(2000) <-> $1::vector(2000))::float4 as similarity, 
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
