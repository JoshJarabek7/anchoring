use crate::db::models::Technology;
use crate::db::repositories::technologies::TechnologyRepository;
use crate::db::repositories::Repository;
use uuid::Uuid;

/// Service for managing technology-related operations
///
/// This service provides a high-level interface for working with technologies:
/// - CRUD operations for technologies
/// - Search and filtering functionality
/// - Business logic related to technologies

#[derive(Debug)]
pub struct TechnologyService {
    repository: TechnologyRepository,
}

impl Default for TechnologyService {
    fn default() -> Self {
        Self::new()
    }
}

impl TechnologyService {
    /// Create a new TechnologyService instance
    pub fn new() -> Self {
        Self {
            repository: TechnologyRepository::new(),
        }
    }

    /// Get all technologies
    pub async fn get_technologies(&self) -> Result<Vec<Technology>, String> {
        self.repository
            .get_all()
            .await
            .map_err(|e| format!("Error fetching technologies: {}", e))
    }

    /// Create a new technology
    pub async fn create_technology(&self, technology: &Technology) -> Result<Technology, String> {
        // Check if technology with same name already exists
        if let Ok(Some(_)) = self.repository.find_by_name(&technology.name).await {
            return Err(format!(
                "Technology with name '{}' already exists",
                technology.name
            ));
        }

        self.repository
            .create(technology)
            .await
            .map_err(|e| format!("Error creating technology: {}", e))
    }

    /// Delete a technology
    pub async fn delete_technology(&self, id: Uuid) -> Result<bool, String> {
        self.repository
            .delete(id)
            .await
            .map_err(|e| format!("Error deleting technology: {}", e))
    }
}
