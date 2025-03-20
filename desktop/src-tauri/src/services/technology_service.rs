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

    /// Get a technology by ID
    pub async fn get_technology(&self, id: Uuid) -> Result<Option<Technology>, String> {
        self.repository
            .get_by_id(id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))
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

    /// Update an existing technology
    pub async fn update_technology(
        &self,
        id: Uuid,
        technology: &Technology,
    ) -> Result<Technology, String> {
        // Check if technology exists
        let existing = self
            .repository
            .get_by_id(id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))?;

        if existing.is_none() {
            return Err(format!("Technology with ID {} does not exist", id));
        }

        // If name is being changed, check if the new name already exists
        if technology.name != existing.unwrap().name {
            if let Ok(Some(_)) = self.repository.find_by_name(&technology.name).await {
                return Err(format!(
                    "Technology with name '{}' already exists",
                    technology.name
                ));
            }
        }

        self.repository
            .update(id, technology)
            .await
            .map_err(|e| format!("Error updating technology: {}", e))
    }

    /// Delete a technology
    pub async fn delete_technology(&self, id: Uuid) -> Result<bool, String> {
        self.repository
            .delete(id)
            .await
            .map_err(|e| format!("Error deleting technology: {}", e))
    }

    /// Get technologies by language
    pub async fn get_technologies_by_language(
        &self,
        language: &str,
    ) -> Result<Vec<Technology>, String> {
        self.repository
            .get_by_language(language)
            .await
            .map_err(|e| format!("Error fetching technologies by language: {}", e))
    }

    /// Find technology by name
    pub async fn find_technology_by_name(&self, name: &str) -> Result<Option<Technology>, String> {
        self.repository
            .find_by_name(name)
            .await
            .map_err(|e| format!("Error finding technology by name: {}", e))
    }

    /// Search technologies by name (partial match)
    pub async fn search_technologies(&self, query: &str) -> Result<Vec<Technology>, String> {
        self.repository
            .search_by_name(query)
            .await
            .map_err(|e| format!("Error searching technologies: {}", e))
    }

    /// Get or create a technology by name
    pub async fn get_or_create_technology(
        &self,
        name: &str,
        language: Option<&str>,
    ) -> Result<Technology, String> {
        // First try to find the technology
        if let Ok(Some(tech)) = self.repository.find_by_name(name).await {
            return Ok(tech);
        }

        // Create a new technology if it doesn't exist
        let new_tech = Technology {
            id: Uuid::new_v4(),
            name: name.to_string(),
            language: language.map(|s| s.to_string()),
            related: None,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        self.repository
            .create(&new_tech)
            .await
            .map_err(|e| format!("Error creating technology: {}", e))
    }
}
