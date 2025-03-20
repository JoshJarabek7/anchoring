use crate::db::models::CrawlingSettings;
use crate::db::repositories::Repository;
use crate::db::schema::crawling_settings;
use crate::db::{get_pg_connection, DbError};
use crate::impl_repository;
use diesel::prelude::*;
use uuid::Uuid;

/// Repository for CrawlingSettings CRUD operations

#[derive(Debug)]
pub struct CrawlingSettingsRepository;

impl CrawlingSettingsRepository {
    pub fn new() -> Self {
        Self {}
    }

    /// Get crawling settings for a specific technology version
    pub async fn get_for_version(
        &self,
        version_id: Uuid,
    ) -> Result<Option<CrawlingSettings>, DbError> {
        let ver_id = version_id;

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            crawling_settings::table
                .filter(crawling_settings::version_id.eq(ver_id))
                .first::<CrawlingSettings>(&mut conn)
                .optional()
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Save crawling settings for a version (create or update)
    pub async fn save_for_version(
        &self,
        settings: CrawlingSettings,
    ) -> Result<CrawlingSettings, DbError> {
        // Check if settings exist for this version
        let existing = self.get_for_version(settings.version_id).await?;

        if let Some(existing) = existing {
            // Update existing settings
            let mut updated_settings = settings.clone();
            updated_settings.version_id = settings.version_id;
            self.update(existing.id, &updated_settings).await
        } else {
            // Create new settings
            let mut new_settings = settings.clone();
            new_settings.id = Uuid::new_v4(); // Generate a new UUID
            new_settings.version_id = settings.version_id; // Ensure version ID is set
            self.create(&new_settings).await
        }
    }

    /// Get or create default settings for a version
    pub async fn get_or_create_default(
        &self,
        version_id: Uuid,
    ) -> Result<CrawlingSettings, DbError> {
        // Try to get existing settings
        if let Some(settings) = self.get_for_version(version_id).await? {
            return Ok(settings);
        }

        // Create default settings if none exist
        let default_settings = CrawlingSettings {
            id: Uuid::new_v4(),
            version_id,
            prefix_path: None,
            anti_paths: None,
            anti_keywords: None,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        self.create(&default_settings).await
    }
}

// Use the macro to implement Repository trait
impl_repository!(
    CrawlingSettingsRepository,
    CrawlingSettings,
    Uuid,
    crawling_settings::table,
    crawling_settings::id
);

// Convenient public functions
pub async fn get_crawling_settings_for_version(
    version_id: Uuid,
) -> Result<Option<CrawlingSettings>, DbError> {
    CrawlingSettingsRepository::new()
        .get_for_version(version_id)
        .await
}

pub async fn get_or_create_default_settings(version_id: Uuid) -> Result<CrawlingSettings, DbError> {
    CrawlingSettingsRepository::new()
        .get_or_create_default(version_id)
        .await
}

pub async fn save_crawling_settings(
    settings: CrawlingSettings,
) -> Result<CrawlingSettings, DbError> {
    CrawlingSettingsRepository::new()
        .save_for_version(settings)
        .await
}
