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

    /// Get technologies by language
    pub async fn get_by_language(&self, language: &str) -> Result<Vec<Technology>, DbError> {
        let language = language.to_string(); // Clone for ownership

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            technologies::table
                .filter(technologies::language.eq(language))
                .order(technologies::name.asc())
                .load::<Technology>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
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

    /// Search technologies by name (partial match)
    pub async fn search_by_name(&self, query: &str) -> Result<Vec<Technology>, DbError> {
        let search_pattern = format!("%{}%", query.to_lowercase());

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            technologies::table
                .filter(lower(technologies::name).like(search_pattern))
                .order(technologies::name.asc())
                .load::<Technology>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }
}

// Implement the Repository trait using our macro
impl_repository!(
    TechnologyRepository,
    Technology,
    Uuid,
    technologies::table,
    technologies::id
);

// Convenient public functions - simplified with improved error handling
pub async fn get_all_technologies() -> Result<Vec<Technology>, DbError> {
    TechnologyRepository::new().get_all().await
}

pub async fn get_technology(id: Uuid) -> Result<Option<Technology>, DbError> {
    TechnologyRepository::new().get_by_id(id).await
}

pub async fn create_technology(tech: Technology) -> Result<Technology, DbError> {
    TechnologyRepository::new().create(&tech).await
}

pub async fn update_technology(id: Uuid, tech: Technology) -> Result<Technology, DbError> {
    TechnologyRepository::new().update(id, &tech).await
}

pub async fn delete_technology(id: Uuid) -> Result<bool, DbError> {
    TechnologyRepository::new().delete(id).await
}

pub async fn find_technology_by_name(name: &str) -> Result<Option<Technology>, DbError> {
    TechnologyRepository::new().find_by_name(name).await
}

pub async fn search_technologies(query: &str) -> Result<Vec<Technology>, DbError> {
    TechnologyRepository::new().search_by_name(query).await
}
