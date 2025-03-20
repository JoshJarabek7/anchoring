use crate::db::models::{Technology, TechnologyVersion};
use crate::db::repositories::technologies::TechnologyRepository;
use crate::db::repositories::versions::VersionRepository;
use crate::db::repositories::Repository;
use crate::db::DbError;
use uuid::Uuid;

/// Service for managing technology version operations
///
/// This service provides a high-level interface for working with technology versions:
/// - CRUD operations for versions
/// - Relationships between technologies and versions
/// - Business logic related to versioning
#[derive(Debug)]
pub struct VersionService {
    repository: VersionRepository,
    tech_repository: TechnologyRepository,
}

impl Default for VersionService {
    fn default() -> Self {
        Self::new()
    }
}

impl VersionService {
    /// Create a new VersionService instance
    pub fn new() -> Self {
        Self {
            repository: VersionRepository::new(),
            tech_repository: TechnologyRepository::new(),
        }
    }

    /// Get all versions
    pub async fn get_versions(&self) -> Result<Vec<TechnologyVersion>, String> {
        self.repository
            .get_all()
            .await
            .map_err(|e| format!("Error fetching versions: {}", e))
    }

    /// Get versions for a specific technology
    pub async fn get_versions_for_technology(
        &self,
        tech_id: Uuid,
    ) -> Result<Vec<TechnologyVersion>, String> {
        // Check if technology exists
        let tech = self
            .tech_repository
            .get_by_id(tech_id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))?;

        if tech.is_none() {
            return Err(format!("Technology with ID {} does not exist", tech_id));
        }

        self.repository
            .get_for_technology(tech_id)
            .await
            .map_err(|e| format!("Error fetching versions: {}", e))
    }

    /// Get a version by ID
    pub async fn get_version(&self, id: Uuid) -> Result<Option<TechnologyVersion>, String> {
        self.repository
            .get_by_id(id)
            .await
            .map_err(|e| format!("Error fetching version: {}", e))
    }

    /// Create a new version
    pub async fn create_version(
        &self,
        version: &TechnologyVersion,
    ) -> Result<TechnologyVersion, String> {
        // Check if technology exists
        let tech = self
            .tech_repository
            .get_by_id(version.technology_id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))?;

        if tech.is_none() {
            return Err(format!(
                "Technology with ID {} does not exist",
                version.technology_id
            ));
        }

        // Check if version with the same name already exists for this technology
        if let Ok(Some(_)) = self
            .repository
            .find_by_version(version.technology_id, &version.version)
            .await
        {
            return Err(format!(
                "Version '{}' already exists for this technology",
                version.version
            ));
        }

        self.repository
            .create(version)
            .await
            .map_err(|e| format!("Error creating version: {}", e))
    }

    /// Update an existing version
    pub async fn update_version(
        &self,
        id: Uuid,
        version: &TechnologyVersion,
    ) -> Result<TechnologyVersion, String> {
        // Check if version exists
        let existing = self
            .repository
            .get_by_id(id)
            .await
            .map_err(|e| format!("Error fetching version: {}", e))?;

        if existing.is_none() {
            return Err(format!("Version with ID {} does not exist", id));
        }

        // If version string is being changed, check if the new name already exists for this technology
        let existing = existing.unwrap();
        if version.version != existing.version {
            if let Ok(Some(_)) = self
                .repository
                .find_by_version(version.technology_id, &version.version)
                .await
            {
                return Err(format!(
                    "Version '{}' already exists for this technology",
                    version.version
                ));
            }
        }

        self.repository
            .update(id, version)
            .await
            .map_err(|e| format!("Error updating version: {}", e))
    }

    /// Delete a version
    pub async fn delete_version(&self, id: Uuid) -> Result<bool, String> {
        self.repository
            .delete(id)
            .await
            .map_err(|e| format!("Error deleting version: {}", e))
    }

    /// Get or create a version by technology ID and version string
    pub async fn get_or_create_version(
        &self,
        tech_id: Uuid,
        version_str: &str,
    ) -> Result<TechnologyVersion, String> {
        // First try to find the version
        if let Ok(Some(version)) = self.repository.find_by_version(tech_id, version_str).await {
            return Ok(version);
        }

        // Check if technology exists
        let tech = self
            .tech_repository
            .get_by_id(tech_id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))?;

        if tech.is_none() {
            return Err(format!("Technology with ID {} does not exist", tech_id));
        }

        // Create a new version if it doesn't exist
        let new_version = TechnologyVersion {
            id: Uuid::new_v4(),
            technology_id: tech_id,
            version: version_str.to_string(),
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        self.repository
            .create(&new_version)
            .await
            .map_err(|e| format!("Error creating version: {}", e))
    }
}
