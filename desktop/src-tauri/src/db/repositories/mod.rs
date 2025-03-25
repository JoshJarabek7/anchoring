pub mod crawling_settings;
pub mod documentation;
pub mod documentation_url;
pub mod proxies;
pub mod technologies;
pub mod versions;

use crate::db::DbError;
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

/// Generic repository trait for common CRUD operations
#[async_trait::async_trait]
pub trait Repository<T, ID>
where
    T: Debug + Send + Sync + Clone, // Only require Clone
    ID: Debug + Send + Clone + Sync,
{
    /// Get all items
    async fn get_all(&self) -> Result<Vec<T>, DbError>;

    /// Get item by ID
    async fn get_by_id(&self, id: ID) -> Result<Option<T>, DbError>;

    /// Create a new item
    async fn create(&self, item: &T) -> Result<T, DbError>; // Take reference

    /// Update an existing item
    async fn update(&self, id: ID, item: &T) -> Result<T, DbError>; // Take reference

    /// Delete an item
    async fn delete(&self, id: ID) -> Result<bool, DbError>;
}

/// Config for timeout in database operations
#[derive(Debug, Clone)]
pub struct TimeoutConfig {
    /// Timeout for initialization in seconds
    pub init_timeout_secs: u64,
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            init_timeout_secs: 30,
        }
    }
}

/// Optional pagination parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginationParams {
    pub page: i64,
    pub per_page: i64,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: 1,
            per_page: 20,
        }
    }
}

/// Macro to create a correctly implemented repository
#[macro_export]
macro_rules! impl_repository {
    ($repo_type:ty, $model_type:ty, $id_type:ty, $table:expr, $id_column:expr) => {
        #[async_trait::async_trait]
        impl Repository<$model_type, $id_type> for $repo_type {
            async fn get_all(&self) -> Result<Vec<$model_type>, DbError> {
                let table = $table;

                let results = tokio::task::spawn_blocking(move || {
                    let mut conn = crate::db::get_pg_connection()?;

                    table
                        .load::<$model_type>(&mut conn)
                        .map_err(DbError::QueryError)
                })
                .await
                .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))??;

                Ok(results)
            }

            async fn get_by_id(&self, id: $id_type) -> Result<Option<$model_type>, DbError> {
                let table = $table;
                let id_col = $id_column;
                let id = id; // Move id into the closure

                let result = tokio::task::spawn_blocking(move || {
                    let mut conn = crate::db::get_pg_connection()?;

                    table
                        .filter(id_col.eq(id))
                        .first::<$model_type>(&mut conn)
                        .optional()
                        .map_err(DbError::QueryError)
                })
                .await
                .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))??;

                Ok(result)
            }

            async fn create(&self, item: &$model_type) -> Result<$model_type, DbError> {
                // Clone item and move it into the closure for spawn_blocking
                let item_clone = item.clone(); // Clone it here
                let table = $table;

                tokio::task::spawn_blocking(move || {
                    let mut conn = crate::db::get_pg_connection()?;

                    diesel::insert_into(table)
                        .values(&item_clone)
                        .get_result::<$model_type>(&mut conn)
                        .map_err(DbError::QueryError)
                })
                .await
                .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
            }

            async fn update(
                &self,
                id: $id_type,
                item: &$model_type,
            ) -> Result<$model_type, DbError> {
                // Move variables into the closure for spawn_blocking
                let id = id;
                let item_clone = item.clone(); // Clone it here
                let table = $table;
                let id_col = $id_column;

                tokio::task::spawn_blocking(move || {
                    let mut conn = crate::db::get_pg_connection()?;

                    diesel::update(table.filter(id_col.eq(id)))
                        .set(&item_clone)
                        .get_result::<$model_type>(&mut conn)
                        .map_err(DbError::QueryError)
                })
                .await
                .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
            }

            async fn delete(&self, id: $id_type) -> Result<bool, DbError> {
                let table = $table;
                let id_col = $id_column;
                let id = id; // Move id into the closure

                let count = tokio::task::spawn_blocking(move || {
                    let mut conn = crate::db::get_pg_connection()?;

                    diesel::delete(table.filter(id_col.eq(id)))
                        .execute(&mut conn)
                        .map_err(DbError::QueryError)
                })
                .await
                .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))??;

                Ok(count > 0)
            }
        }
    };
}
