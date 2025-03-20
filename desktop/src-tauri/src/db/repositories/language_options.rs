use crate::db::models::LanguageOption;
use crate::db::repositories::Repository;
use crate::db::schema::language_options;
use crate::db::{get_pg_connection, DbError};
use crate::impl_repository;
use chrono::Utc;
use diesel::prelude::*;
use uuid::Uuid;

/// Repository for LanguageOption CRUD operations
#[derive(Debug)]
pub struct LanguageOptionRepository;

impl LanguageOptionRepository {
    pub fn new() -> Self {
        Self {}
    }

    /// Get language options ordered by use count and recent usage
    pub async fn get_popular_languages(&self, limit: i64) -> Result<Vec<LanguageOption>, DbError> {
        let limit_val = limit;

        tokio::task::spawn_blocking(move || {
            let mut conn = get_pg_connection()?;

            language_options::table
                .order((
                    language_options::use_count.desc(),
                    language_options::last_used.desc(),
                ))
                .limit(limit_val)
                .load::<LanguageOption>(&mut conn)
                .map_err(DbError::QueryError)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }

    /// Record usage of a language - create if not exists, or increment use count
    pub async fn record_language_use(&self, language: &str) -> Result<LanguageOption, DbError> {
        let language_str = language.to_string();

        tokio::task::spawn_blocking(move || -> Result<LanguageOption, DbError> {
            let mut conn = get_pg_connection()?;

            // Check if language exists
            let existing = language_options::table
                .filter(language_options::language.eq(&language_str))
                .first::<LanguageOption>(&mut conn)
                .optional()
                .map_err(DbError::QueryError)?;

            if let Some(mut existing_lang) = existing {
                // Update existing language
                existing_lang.use_count += 1;
                existing_lang.last_used = Utc::now().naive_utc();

                let updated = diesel::update(
                    language_options::table.filter(language_options::id.eq(existing_lang.id)),
                )
                .set((
                    language_options::use_count.eq(existing_lang.use_count),
                    language_options::last_used.eq(existing_lang.last_used),
                ))
                .get_result::<LanguageOption>(&mut conn)
                .map_err(DbError::QueryError)?;

                Ok(updated)
            } else {
                // Create new language entry
                let new_lang = LanguageOption {
                    id: Uuid::new_v4(),
                    language: language_str,
                    use_count: 1,
                    last_used: Utc::now().naive_utc(),
                };

                let created = diesel::insert_into(language_options::table)
                    .values(&new_lang)
                    .get_result::<LanguageOption>(&mut conn)
                    .map_err(DbError::QueryError)?;

                Ok(created)
            }
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }
}

// Use the macro to implement Repository trait
impl_repository!(
    LanguageOptionRepository,
    LanguageOption,
    Uuid,
    language_options::table,
    language_options::id
);

// Convenient public functions
pub async fn get_all_languages() -> Result<Vec<LanguageOption>, DbError> {
    LanguageOptionRepository::new().get_all().await
}

pub async fn get_popular_languages(limit: i64) -> Result<Vec<LanguageOption>, DbError> {
    LanguageOptionRepository::new()
        .get_popular_languages(limit)
        .await
}

pub async fn record_language_use(language: &str) -> Result<LanguageOption, DbError> {
    LanguageOptionRepository::new()
        .record_language_use(language)
        .await
}
