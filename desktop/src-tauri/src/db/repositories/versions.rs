use crate::db::models::TechnologyVersion;
use crate::db::repositories::Repository;
use crate::db::schema::technology_versions;
use crate::db::{get_pg_connection, DbError};
use crate::impl_repository;
use diesel::prelude::*;
use uuid::Uuid;

/// Repository for TechnologyVersion CRUD operations
#[derive(Debug)]
pub struct VersionRepository;

impl VersionRepository {
    pub fn new() -> Self {
        Self {}
    }

    /// Get versions for a specific technology
    pub async fn get_for_technology(
        &self,
        tech_id: Uuid,
    ) -> Result<Vec<TechnologyVersion>, DbError> {
        let tech_id_val = tech_id;

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            technology_versions::table
                .filter(technology_versions::technology_id.eq(tech_id_val))
                .order(technology_versions::version.asc()) // Order by version string
                .load::<TechnologyVersion>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Find version by technology and version string
    pub async fn find_by_version(
        &self,
        tech_id: Uuid,
        version: &str,
    ) -> Result<Option<TechnologyVersion>, DbError> {
        let tech_id_val = tech_id;
        let version_val = version.to_string();

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            technology_versions::table
                .filter(technology_versions::technology_id.eq(tech_id_val))
                .filter(technology_versions::version.eq(version_val))
                .first::<TechnologyVersion>(&mut conn)
                .optional()
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }
}

// Use the macro to implement Repository trait
impl_repository!(
    VersionRepository,
    TechnologyVersion,
    Uuid,
    technology_versions::table,
    technology_versions::id
);

// Convenient public functions
pub async fn get_all_versions() -> Result<Vec<TechnologyVersion>, DbError> {
    VersionRepository::new().get_all().await
}

pub async fn get_versions_for_technology(tech_id: Uuid) -> Result<Vec<TechnologyVersion>, DbError> {
    VersionRepository::new().get_for_technology(tech_id).await
}

pub async fn get_version(id: Uuid) -> Result<Option<TechnologyVersion>, DbError> {
    VersionRepository::new().get_by_id(id).await
}

pub async fn create_version(version: TechnologyVersion) -> Result<TechnologyVersion, DbError> {
    VersionRepository::new().create(&version).await
}

pub async fn update_version(
    id: Uuid,
    version: TechnologyVersion,
) -> Result<TechnologyVersion, DbError> {
    VersionRepository::new().update(id, &version).await
}

pub async fn delete_version(id: Uuid) -> Result<bool, DbError> {
    VersionRepository::new().delete(id).await
}

pub async fn find_version(
    tech_id: Uuid,
    version_str: &str,
) -> Result<Option<TechnologyVersion>, DbError> {
    VersionRepository::new()
        .find_by_version(tech_id, version_str)
        .await
}
