use crate::db::schema::*;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use pgvector::Vector;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Technology model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = technologies)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct Technology {
    pub id: Uuid,
    pub name: String,
    pub language: Option<String>,
    pub related: Option<Vec<Option<String>>>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// TechnologyVersion model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = technology_versions)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct TechnologyVersion {
    pub id: Uuid,
    pub technology_id: Uuid,
    pub version: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// DocumentationUrl model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = documentation_urls)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct DocumentationUrl {
    pub id: Uuid,
    pub technology_id: Uuid,
    pub version_id: Uuid,
    pub url: String,
    pub status: String,
    pub html: Option<String>,
    pub markdown: Option<String>,
    pub cleaned_markdown: Option<String>,
    pub is_processed: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// URL Status enum
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum UrlStatus {
    PendingCrawl,
    Crawling,
    Crawled,
    CrawlError,
    PendingMarkdown,
    ConvertingMarkdown,
    MarkdownReady,
    MarkdownError,
    PendingProcessing,
    Processing,
    Processed,
    ProcessingError,
    Skipped,
}

impl From<String> for UrlStatus {
    fn from(s: String) -> Self {
        match s.as_str() {
            "pending_crawl" => UrlStatus::PendingCrawl,
            "crawling" => UrlStatus::Crawling,
            "crawled" => UrlStatus::Crawled,
            "crawl_error" => UrlStatus::CrawlError,
            "pending_markdown" => UrlStatus::PendingMarkdown,
            "converting_markdown" => UrlStatus::ConvertingMarkdown,
            "markdown_ready" => UrlStatus::MarkdownReady,
            "markdown_error" => UrlStatus::MarkdownError,
            "pending_processing" => UrlStatus::PendingProcessing,
            "processing" => UrlStatus::Processing,
            "processed" => UrlStatus::Processed,
            "processing_error" => UrlStatus::ProcessingError,
            "skipped" => UrlStatus::Skipped,
            _ => UrlStatus::PendingCrawl, // Default
        }
    }
}

impl From<UrlStatus> for String {
    fn from(status: UrlStatus) -> Self {
        match status {
            UrlStatus::PendingCrawl => "pending_crawl".to_string(),
            UrlStatus::Crawling => "crawling".to_string(),
            UrlStatus::Crawled => "crawled".to_string(),
            UrlStatus::CrawlError => "crawl_error".to_string(),
            UrlStatus::PendingMarkdown => "pending_markdown".to_string(),
            UrlStatus::ConvertingMarkdown => "converting_markdown".to_string(),
            UrlStatus::MarkdownReady => "markdown_ready".to_string(),
            UrlStatus::MarkdownError => "markdown_error".to_string(),
            UrlStatus::PendingProcessing => "pending_processing".to_string(),
            UrlStatus::Processing => "processing".to_string(),
            UrlStatus::Processed => "processed".to_string(),
            UrlStatus::ProcessingError => "processing_error".to_string(),
            UrlStatus::Skipped => "skipped".to_string(),
        }
    }
}

impl DocumentationUrl {
    pub fn get_status(&self) -> UrlStatus {
        UrlStatus::from(self.status.clone())
    }

    pub fn set_status(&mut self, status: UrlStatus) {
        self.status = String::from(status);
    }

    // Helper methods for status comparison
    pub fn status_equals(&self, status: UrlStatus) -> bool {
        self.status == String::from(status)
    }

    pub fn is_crawled(&self) -> bool {
        self.status == String::from(UrlStatus::Crawled)
    }

    pub fn is_markdown_ready(&self) -> bool {
        self.status == String::from(UrlStatus::MarkdownReady)
    }
}

// DocumentationSnippet model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    QueryableByName,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = documentation_snippets)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct DocumentationSnippet {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    pub id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub title: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub description: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub content: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub source_url: String,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    pub technology_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    pub version_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Array<diesel::sql_types::Nullable<diesel::sql_types::Text>>>)]
    pub concepts: Option<Vec<Option<String>>>,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub created_at: NaiveDateTime,
    #[diesel(sql_type = diesel::sql_types::Timestamp)]
    pub updated_at: NaiveDateTime,
}

// // DocumentationEmbedding model
#[derive(Debug, Queryable, Selectable, Clone)]
#[diesel(table_name = documentation_embeddings)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct DocumentationEmbedding {
    pub id: Uuid,
    pub snippet_id: Uuid,
    pub embedding: Vector,
    pub created_at: NaiveDateTime,
}

// Proxy model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = proxies)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct Proxy {
    pub id: Uuid,
    pub url: String,
    pub last_used: Option<NaiveDateTime>,
}

// CrawlingSettings model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = crawling_settings)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct CrawlingSettings {
    pub id: Uuid,
    pub version_id: Uuid,
    pub prefix_path: Option<String>,
    pub anti_paths: Option<String>,
    pub anti_keywords: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// LanguageOption model
#[derive(
    Debug,
    Serialize,
    Deserialize,
    Queryable,
    Selectable,
    Identifiable,
    Insertable,
    AsChangeset,
    Clone,
)]
#[diesel(table_name = language_options)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[serde(rename_all = "camelCase")]
pub struct LanguageOption {
    pub id: Uuid,
    pub language: String,
    pub use_count: i32,
    pub last_used: NaiveDateTime,
}

// TechComponent model - client-side only
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TechComponent {
    pub name: String,
    pub version: Option<String>,
}
