# Vector Database System

The vector database system in Anchoring is designed with clean separation of concerns and flexibility to support multiple vector database providers. This document explains how vector databases are configured, instantiated, and used throughout the application.

## Architecture Overview

The system follows these key principles:
1. Components only interact with a simple `VectorDBInstance` interface
2. Configuration and implementation details are completely isolated within providers
3. Each session has its own vector database configuration
4. Provider-specific details are stored as JSON in the database

## Database Schema

Vector database configurations are stored in the `vector_db_config` table:

```sql
CREATE TABLE vector_db_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL UNIQUE,
  provider_type TEXT NOT NULL,
  config JSON NOT NULL CHECK(json_valid(config)),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
);
```

## Core Interfaces

### VectorDBInstance

The interface that components interact with:

```typescript
interface VectorDBInstance {
  addDocuments(documents: FullDocumentationSnippet[]): Promise<void>;
  searchDocuments(queryEmbedding: number[], filterDict?: Record<string, any>, limit?: number): Promise<FullDocumentationSnippet[]>;
  getDocumentsByFilters(filters?: DocumentFilter, limit?: number): Promise<FullDocumentationSnippet[]>;
  isAvailable(): boolean;
}
```

### VectorDBProvider

The interface that providers must implement:

```typescript
interface VectorDBProvider {
  getInstance(sessionId: number): Promise<VectorDBInstance>;
  configure(sessionId: number, config: Record<string, any>): Promise<void>;
}
```

## Using Vector Databases in Components

Components use the `useVectorDB` hook to access vector database functionality:

```typescript
function MyComponent({ sessionId }: { sessionId: number }) {
  const { vectorDB, error, loading } = useVectorDB(sessionId);

  async function searchDocs(query: string) {
    if (!vectorDB) return;
    
    const embedding = await generateEmbedding(query);
    const results = await vectorDB.searchDocuments(embedding);
    // ... use results
  }
}
```

The hook handles:
- Lazy initialization of the vector database
- Error handling
- Loading states
- Cleanup on unmount

## Adding a New Provider

To add support for a new vector database:

1. Create a new provider class implementing `VectorDBProvider`:
```typescript
export class NewProvider implements VectorDBProvider {
  async getInstance(sessionId: number): Promise<VectorDBInstance> {
    // Get config from database
    const config = await getVectorDBConfig(sessionId);
    if (!config) throw new Error('No config found');

    // Initialize your database client
    const client = new YourDatabaseClient(config.config);
    
    // Return an instance implementing VectorDBInstance
    return new YourDatabaseInstance(client);
  }

  async configure(sessionId: number, config: Record<string, any>): Promise<void> {
    // Validate config
    if (!config.requiredField) throw new Error('Missing required field');

    // Save config to database
    await saveVectorDBConfig({
      session_id: sessionId,
      provider_type: 'your-provider',
      config: config // Will be stored as JSON
    });
  }
}
```

2. Register the provider:
```typescript
registerProvider('your-provider', new NewProvider());
```

## Current Providers

### ChromaDB (Local)
- Used for local development and testing
- Stores embeddings in a local ChromaDB instance
- Configuration: `{ host: string, port: number, apiKey: string }`

### Pinecone (Shared)
- Used for production and shared environments
- Stores embeddings in a Pinecone cloud instance
- Configuration: `{ apiKey: string, environment: string, indexName: string }`

## Best Practices

1. **Never** handle vector database implementation details in components
2. **Always** use the `useVectorDB` hook to access vector database functionality
3. Let the provider system handle configuration and initialization
4. Use TypeScript interfaces to ensure type safety
5. Handle loading and error states appropriately in components 