use crate::db::models::Technology;
use crate::db::repositories::Repository;
use crate::db::schema::technologies;
use crate::db::{get_pg_connection, DbError};
use crate::impl_repository;
use diesel::prelude::*;
use diesel::sql_types::Text;

// Define the lower SQL function using the modern approach
diesel::define_sql_function! {
    fn lower(x: Text) -> Text;
}

use uuid::Uuid;

/// Repository for Technology CRUD operations
#[derive(Debug)]
pub struct TechnologyRepository;

impl TechnologyRepository {
    pub fn new() -> Self {
        Self {}
    }

    /// Find technology by name (exact match)
    pub async fn find_by_name(&self, name: &str) -> Result<Option<Technology>, DbError> {
        let name = name.to_string(); // Clone for ownership

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            technologies::table
                .filter(technologies::name.eq(name))
                .first::<Technology>(&mut conn)
                .optional()
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    // /// Search technologies by name (partial match)
    // This method is not currently used in the codebase
    // pub async fn search_by_name(&self, query: &str) -> Result<Vec<Technology>, DbError> {
    //     let search_pattern = format!("%{}%", query.to_lowercase());
    //
    //     tokio::task::spawn_blocking(move || {
    //         let mut conn = get_pg_connection()?;
    //
    //         technologies::table
    //             .filter(lower(technologies::name).like(search_pattern))
    //             .order(technologies::name.asc())
    //             .load::<Technology>(&mut conn)
    //             .map_err(DbError::QueryError)
    //     })
    //     .await
    //     .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    // }
}

// Implement the Repository trait using our macro
impl_repository!(
    TechnologyRepository,
    Technology,
    Uuid,
    technologies::table,
    technologies::id
);
