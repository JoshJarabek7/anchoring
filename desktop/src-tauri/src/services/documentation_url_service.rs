use crate::db::models::{DocumentationUrl, UrlStatus};
use crate::db::models::{Technology, TechnologyVersion};
use crate::db::repositories::documentation_url::DocumentationUrlRepository;
use crate::db::repositories::technologies::TechnologyRepository;
use crate::db::repositories::versions::VersionRepository;
use crate::db::repositories::Repository;
use uuid::Uuid;

/// Service for managing documentation URLs
///
/// This service provides a high-level interface for working with documentation URLs:
/// - Adding and managing URLs for technology versions
/// - Updating URL status and content
/// - Querying URLs by technology and version

#[derive(Debug)]
pub struct DocumentationUrlService {
    tech_repository: TechnologyRepository,
    version_repository: VersionRepository,
    url_repository: DocumentationUrlRepository,
}

impl Default for DocumentationUrlService {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentationUrlService {
    /// Create a new DocumentationUrlService instance
    pub fn new() -> Self {
        Self {
            tech_repository: TechnologyRepository::new(),
            version_repository: VersionRepository::new(),
            url_repository: DocumentationUrlRepository::new(),
        }
    }

    /// Add a new documentation URL
    pub async fn add_url(
        &self,
        url: &str,
        technology_id: Uuid,
        version_id: Uuid,
    ) -> Result<DocumentationUrl, String> {
        // Check if technology exists
        let tech = self
            .tech_repository
            .get_by_id(technology_id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))?;

        if tech.is_none() {
            return Err(format!(
                "Technology with ID {} does not exist",
                technology_id
            ));
        }

        // Check if version exists
        let version = self
            .version_repository
            .get_by_id(version_id)
            .await
            .map_err(|e| format!("Error fetching version: {}", e))?;

        if version.is_none() {
            return Err(format!("Version with ID {} does not exist", version_id));
        }

        // Check if URL already exists for this technology and version
        let existing = self.get_url_by_url(technology_id, version_id, url).await?;
        if existing.is_some() {
            return Ok(existing.unwrap());
        }

        // Create new URL
        let doc_url = DocumentationUrl {
            id: Uuid::new_v4(),
            technology_id,
            version_id,
            url: url.to_string(),
            status: String::from(UrlStatus::PendingCrawl),
            html: None,
            markdown: None,
            cleaned_markdown: None,
            is_processed: false,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        // Store in database
        self.url_repository
            .create(&doc_url)
            .await
            .map_err(|e| format!("Error creating documentation URL: {}", e))
    }

    /// Get all URLs for a specific version
    pub async fn get_urls_for_version(
        &self,
        version_id: Uuid,
        include_content: bool,
    ) -> Result<Vec<DocumentationUrl>, String> {
        // Check if version exists
        let version = self
            .version_repository
            .get_by_id(version_id)
            .await
            .map_err(|e| format!("Error fetching version: {}", e))?;

        if version.is_none() {
            return Err(format!("Version with ID {} does not exist", version_id));
        }

        // Get URLs from repository
        self.url_repository
            .get_by_version(version_id, include_content)
            .await
            .map_err(|e| format!("Error fetching documentation URLs: {}", e))
    }

    /// Get URL by ID
    pub async fn get_url_by_id(&self, id: Uuid) -> Result<Option<DocumentationUrl>, String> {
        self.url_repository
            .get_by_id(id)
            .await
            .map_err(|e| format!("Error fetching documentation URL: {}", e))
    }

    /// Get URL by URL string
    pub async fn get_url_by_url(
        &self,
        technology_id: Uuid,
        version_id: Uuid,
        url: &str,
    ) -> Result<Option<DocumentationUrl>, String> {
        self.url_repository
            .get_by_url(technology_id, version_id, url)
            .await
            .map_err(|e| format!("Error fetching documentation URL: {}", e))
    }

    /// Update URL status
    pub async fn update_url_status(
        &self,
        id: Uuid,
        status: UrlStatus,
    ) -> Result<DocumentationUrl, String> {
        // Check if URL exists
        let url = self.get_url_by_id(id).await?;
        if url.is_none() {
            return Err(format!("Documentation URL with ID {} does not exist", id));
        }

        // For skipped URLs, also clear content to save space
        let updates = if status == UrlStatus::Skipped {
            vec![
                ("status".to_string(), Some(String::from(status))),
                ("html".to_string(), None),
                ("markdown".to_string(), None),
                ("cleaned_markdown".to_string(), None),
            ]
        } else {
            vec![("status".to_string(), Some(String::from(status)))]
        };

        self.url_repository
            .update_fields(id, &updates)
            .await
            .map_err(|e| format!("Error updating URL status: {}", e))
    }

    /// Update URL content (HTML)
    pub async fn update_url_html(&self, id: Uuid, html: &str) -> Result<DocumentationUrl, String> {
        // Check if URL exists
        let url = self.get_url_by_id(id).await?;
        if url.is_none() {
            return Err(format!("Documentation URL with ID {} does not exist", id));
        }

        // Update HTML field
        let updates = vec![("html".to_string(), Some(html.to_string()))];

        self.url_repository
            .update_fields(id, &updates)
            .await
            .map_err(|e| format!("Error updating URL HTML content: {}", e))
    }

    /// Update URL content (Cleaned Markdown)
    pub async fn update_url_cleaned_markdown(
        &self,
        id: Uuid,
        cleaned_markdown: &str,
    ) -> Result<DocumentationUrl, String> {
        // Check if URL exists
        let url = self.get_url_by_id(id).await?;
        if url.is_none() {
            return Err(format!("Documentation URL with ID {} does not exist", id));
        }

        // Update cleaned_markdown field
        let updates = vec![(
            "cleaned_markdown".to_string(),
            Some(cleaned_markdown.to_string()),
        )];

        self.url_repository
            .update_fields(id, &updates)
            .await
            .map_err(|e| format!("Error updating URL cleaned markdown content: {}", e))
    }

    /// Update URL markdown with multiple fields at once
    pub async fn update_url_markdown(
        &self,
        id: Uuid,
        markdown: Option<String>,
        cleaned_markdown: Option<String>,
        status: UrlStatus,
    ) -> Result<DocumentationUrl, String> {
        // Check if URL exists
        let url = self.get_url_by_id(id).await?;
        if url.is_none() {
            return Err(format!("Documentation URL with ID {} does not exist", id));
        }

        // Build updates array
        let mut updates = Vec::new();

        // Add status
        updates.push(("status".to_string(), Some(String::from(status))));

        // Add markdown if provided
        if let Some(md) = markdown {
            updates.push(("markdown".to_string(), Some(md)));
        }

        // Add cleaned markdown if provided
        if let Some(clean_md) = cleaned_markdown {
            updates.push(("cleaned_markdown".to_string(), Some(clean_md)));
        }

        self.url_repository
            .update_fields(id, &updates)
            .await
            .map_err(|e| format!("Error updating URL markdown content: {}", e))
    }

    /// Get the technology and version for a documentation URL
    pub async fn get_tech_and_version_for_url(
        &self,
        url_id: Uuid,
    ) -> Result<(Technology, TechnologyVersion), String> {
        // Get the URL by ID
        let url = self
            .get_url_by_id(url_id)
            .await?
            .ok_or_else(|| format!("Documentation URL with ID {} does not exist", url_id))?;

        // Fetch the technology
        let technology = self
            .tech_repository
            .get_by_id(url.technology_id)
            .await
            .map_err(|e| format!("Error fetching technology: {}", e))?
            .ok_or_else(|| format!("Technology with ID {} does not exist", url.technology_id))?;

        // Fetch the version
        let version = self
            .version_repository
            .get_by_id(url.version_id)
            .await
            .map_err(|e| format!("Error fetching version: {}", e))?
            .ok_or_else(|| format!("Version with ID {} does not exist", url.version_id))?;

        Ok((technology, version))
    }

    pub async fn delete_url(&self, url_id: Uuid) -> Result<(), String> {
        let url = self
            .get_url_by_id(url_id)
            .await?
            .ok_or_else(|| format!("Documentation URL with ID {} does not exist", url_id))?;

        self.url_repository
            .delete(url.id)
            .await
            .map_err(|e| format!("Error deleting URL: {}", e))?;
        Ok(())
    }
}
