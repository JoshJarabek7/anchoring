use crate::db::models::DocumentationUrl;
use crate::db::repositories::Repository;
use crate::db::schema::documentation_urls;
use crate::db::{get_pg_connection, DbError};
use crate::impl_repository;
use diesel::prelude::*;
use uuid::Uuid;

/// Repository for DocumentationUrl CRUD operations
#[derive(Debug)]
pub struct DocumentationUrlRepository;

impl DocumentationUrlRepository {
    pub fn new() -> Self {
        Self {}
    }

    /// Get all URLs for a version with optional content
    pub async fn get_by_version(
        &self,
        version_id: Uuid,
        include_content: bool,
    ) -> Result<Vec<DocumentationUrl>, DbError> {
        let ver_id = version_id;
        let include = include_content;

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            let mut query = documentation_urls::table
                .filter(documentation_urls::version_id.eq(ver_id))
                .order(documentation_urls::url.asc())
                .into_boxed();

            // Optionally exclude large content fields
            if !include {
                query = query.select((
                    documentation_urls::id,
                    documentation_urls::technology_id,
                    documentation_urls::version_id,
                    documentation_urls::url,
                    documentation_urls::status,
                    diesel::dsl::sql::<diesel::sql_types::Nullable<diesel::sql_types::Text>>(
                        "NULL",
                    ), // html
                    diesel::dsl::sql::<diesel::sql_types::Nullable<diesel::sql_types::Text>>(
                        "NULL",
                    ), // markdown
                    diesel::dsl::sql::<diesel::sql_types::Nullable<diesel::sql_types::Text>>(
                        "NULL",
                    ), // cleaned_markdown
                    documentation_urls::is_processed,
                    documentation_urls::created_at,
                    documentation_urls::updated_at,
                ));
            }

            query
                .load::<DocumentationUrl>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Find a URL by technology, version, and URL string
    pub async fn get_by_url(
        &self,
        technology_id: Uuid,
        version_id: Uuid,
        url: &str,
    ) -> Result<Option<DocumentationUrl>, DbError> {
        let tech_id = technology_id;
        let ver_id = version_id;
        let url_str = url.to_string();

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            documentation_urls::table
                .filter(documentation_urls::technology_id.eq(tech_id))
                .filter(documentation_urls::version_id.eq(ver_id))
                .filter(documentation_urls::url.eq(url_str))
                .first::<DocumentationUrl>(&mut conn)
                .optional()
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Update specific fields of a URL, useful for status changes
    pub async fn update_fields(
        &self,
        id: Uuid,
        updates: &[(String, Option<String>)],
    ) -> Result<DocumentationUrl, DbError> {
        let id_val = id;
        let updates_clone = updates.to_vec();

        tokio::task::spawn_blocking(move || -> Result<DocumentationUrl, DbError> {
            let mut conn = get_pg_connection()?;

            conn.transaction(|conn| {
                // Get the current URL to update
                let url = documentation_urls::table
                    .filter(documentation_urls::id.eq(id_val))
                    .first::<DocumentationUrl>(conn)
                    .map_err(DbError::QueryError)?;

                // If there are no updates, just return the original
                if updates_clone.is_empty() {
                    return Ok(url);
                }

                // Apply each update as a separate SQL statement
                for (field, value) in &updates_clone {
                    match field.as_str() {
                        "status" => {
                            if let Some(status) = value {
                                diesel::update(documentation_urls::table)
                                    .filter(documentation_urls::id.eq(id_val))
                                    .set(documentation_urls::status.eq(status.clone()))
                                    .execute(conn)
                                    .map_err(DbError::QueryError)?;
                            }
                        }
                        "html" => {
                            diesel::update(documentation_urls::table)
                                .filter(documentation_urls::id.eq(id_val))
                                .set(documentation_urls::html.eq(value.clone()))
                                .execute(conn)
                                .map_err(DbError::QueryError)?;
                        }
                        "markdown" => {
                            diesel::update(documentation_urls::table)
                                .filter(documentation_urls::id.eq(id_val))
                                .set(documentation_urls::markdown.eq(value.clone()))
                                .execute(conn)
                                .map_err(DbError::QueryError)?;
                        }
                        "cleaned_markdown" => {
                            diesel::update(documentation_urls::table)
                                .filter(documentation_urls::id.eq(id_val))
                                .set(documentation_urls::cleaned_markdown.eq(value.clone()))
                                .execute(conn)
                                .map_err(DbError::QueryError)?;
                        }
                        "is_processed" => {
                            if let Some(is_processed) = value {
                                let processed_val = is_processed.parse::<bool>().unwrap_or(false);
                                diesel::update(documentation_urls::table)
                                    .filter(documentation_urls::id.eq(id_val))
                                    .set(documentation_urls::is_processed.eq(processed_val))
                                    .execute(conn)
                                    .map_err(DbError::QueryError)?;
                            }
                        }
                        _ => {} // Ignore unknown fields
                    }
                }

                // Always update the timestamp
                diesel::update(documentation_urls::table)
                    .filter(documentation_urls::id.eq(id_val))
                    .set(documentation_urls::updated_at.eq(chrono::Utc::now().naive_utc()))
                    .execute(conn)
                    .map_err(DbError::QueryError)?;

                // Get the updated record
                let updated_url = documentation_urls::table
                    .filter(documentation_urls::id.eq(id_val))
                    .first::<DocumentationUrl>(conn)
                    .map_err(DbError::QueryError)?;

                Ok(updated_url)
            })
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }
}

// Use the repository macro to implement Repository trait
impl_repository!(
    DocumentationUrlRepository,
    DocumentationUrl,
    Uuid,
    documentation_urls::table,
    documentation_urls::id
);
