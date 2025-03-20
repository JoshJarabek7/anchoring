-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create technologies table
CREATE TABLE technologies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  language TEXT,
  related TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for technologies updated_at
CREATE TRIGGER set_technologies_updated_at
BEFORE UPDATE ON technologies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create technology_versions table
CREATE TABLE technology_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  technology_id UUID NOT NULL REFERENCES technologies(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for technology_versions updated_at
CREATE TRIGGER set_technology_versions_updated_at
BEFORE UPDATE ON technology_versions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create documentation_urls table
CREATE TABLE documentation_urls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  technology_id UUID NOT NULL REFERENCES technologies(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES technology_versions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_crawl',
  html TEXT,
  markdown TEXT,
  cleaned_markdown TEXT,
  is_processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for documentation_urls updated_at
CREATE TRIGGER set_documentation_urls_updated_at
BEFORE UPDATE ON documentation_urls
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create documentation_snippets table
CREATE TABLE documentation_snippets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL,
  technology_id UUID NOT NULL REFERENCES technologies(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES technology_versions(id) ON DELETE CASCADE,
  concepts TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for documentation_snippets updated_at
CREATE TRIGGER set_documentation_snippets_updated_at
BEFORE UPDATE ON documentation_snippets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create documentation_embeddings table
CREATE TABLE documentation_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snippet_id UUID NOT NULL REFERENCES documentation_snippets(id) ON DELETE CASCADE,
  embedding vector(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create proxies table
CREATE TABLE proxies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL UNIQUE,
  last_used TIMESTAMP
);

-- Create crawling_settings table
CREATE TABLE crawling_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES technology_versions(id) ON DELETE CASCADE,
  prefix_path TEXT,
  anti_paths TEXT,
  anti_keywords TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for crawling_settings updated_at
CREATE TRIGGER set_crawling_settings_updated_at
BEFORE UPDATE ON crawling_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create language_options table
CREATE TABLE language_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  language TEXT NOT NULL UNIQUE,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_tech_versions_tech_id ON technology_versions(technology_id);
CREATE INDEX idx_doc_urls_tech_id ON documentation_urls(technology_id);
CREATE INDEX idx_doc_urls_version_id ON documentation_urls(version_id);
CREATE INDEX idx_doc_urls_status ON documentation_urls(status);
CREATE INDEX idx_doc_snippets_tech_id ON documentation_snippets(technology_id);
CREATE INDEX idx_doc_snippets_version_id ON documentation_snippets(version_id);
CREATE INDEX idx_doc_snippets_source_url ON documentation_snippets(source_url);
CREATE INDEX idx_doc_embeddings_snippet_id ON documentation_embeddings(snippet_id);

-- Create HNSW index for high accuracy vector search
CREATE INDEX documentation_embeddings_embedding_idx ON documentation_embeddings 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);