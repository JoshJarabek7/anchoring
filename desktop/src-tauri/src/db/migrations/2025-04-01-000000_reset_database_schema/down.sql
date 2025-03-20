-- Drop indexes first
DROP INDEX IF EXISTS idx_tech_versions_tech_id;
DROP INDEX IF EXISTS idx_doc_urls_tech_id;
DROP INDEX IF EXISTS idx_doc_urls_version_id;
DROP INDEX IF EXISTS idx_doc_urls_status;
DROP INDEX IF EXISTS idx_doc_snippets_tech_id;
DROP INDEX IF EXISTS idx_doc_snippets_version_id;
DROP INDEX IF EXISTS idx_doc_snippets_source_url;
DROP INDEX IF EXISTS idx_doc_embeddings_snippet_id;
DROP INDEX IF EXISTS documentation_embeddings_embedding_idx;

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS documentation_embeddings;
DROP TABLE IF EXISTS documentation_snippets;
DROP TABLE IF EXISTS documentation_urls;
DROP TABLE IF EXISTS technology_versions;
DROP TABLE IF EXISTS crawling_settings;
DROP TABLE IF EXISTS technologies;
DROP TABLE IF EXISTS proxies;
DROP TABLE IF EXISTS language_options;

-- Drop triggers and functions
DROP TRIGGER IF EXISTS set_technologies_updated_at ON technologies;
DROP TRIGGER IF EXISTS set_technology_versions_updated_at ON technology_versions;
DROP TRIGGER IF EXISTS set_documentation_urls_updated_at ON documentation_urls;
DROP TRIGGER IF EXISTS set_documentation_snippets_updated_at ON documentation_snippets;
DROP TRIGGER IF EXISTS set_crawling_settings_updated_at ON crawling_settings;
DROP FUNCTION IF EXISTS update_updated_at_column(); 