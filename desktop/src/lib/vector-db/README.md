# Vector Database Service

This directory contains the implementation of the vector database service for the Anchoring desktop application. The service provides a consistent interface for interacting with different vector database providers, such as ChromaDB (local) and Pinecone (shared).

## Architecture Overview

The vector database service is designed with the following components:

- **Core Types**: Defines interfaces and types for vector DB functionality
- **Service Layer**: Provides functions for managing vector DB instances
- **Provider Implementations**: Adapters for different vector DB backends (ChromaDB, Pinecone)
- **Settings Management**: Global settings for vector DB providers

## Database Schema

The vector DB functionality uses the following table in the SQLite database:

- `vector_db_settings`: Stores global settings for vector DB providers (Pinecone API key, environment, index)

## Directory Structure

- `types.ts`: Core interfaces and types for the vector database system
- `service.ts`: Main service functions for configuring and using vector databases
- `index.ts`: Public API exports
- `providers/`: Directory containing provider implementations
  - `chroma.ts`: ChromaDB provider implementation
  - `pinecone.ts`: Pinecone provider implementation

## Usage

### Basic Usage

```typescript
import { getVectorDBInstance } from '../lib/vector-db';

// Get a vector DB instance for a session
const vectorDB = await getVectorDBInstance(sessionId);

// Add documents to the vector DB
await vectorDB.addDocuments(documents);

// Search for documents
const results = await vectorDB.searchDocuments('query', { category: 'language' }, 10);

// Get documents by filters
const docs = await vectorDB.getDocumentsByFilters({ category: 'language' }, 10);
```

### Settings Management

```typescript
import { saveVectorDBSettings, getVectorDBSettings } from '../lib/db';

// Save vector DB settings
await saveVectorDBSettings({
  pinecone_api_key: 'your-pinecone-api-key',
  pinecone_environment: 'your-environment',
  pinecone_index: 'your-index'
});

// Get vector DB settings
const settings = await getVectorDBSettings();
console.log(settings.pinecone_api_key);
```

## Provider Selection

The system automatically selects the appropriate vector DB provider based on the global settings:

- If Pinecone settings (API key, environment, and index) are configured, the Pinecone provider is used
- Otherwise, the local ChromaDB provider is used

This selection happens in the `getVectorDBInstance` function in `service.ts`:

```typescript
// Determine which provider to use based on settings
const providerName = settings.pinecone_api_key && 
                     settings.pinecone_environment && 
                     settings.pinecone_index ? 'pinecone' : 'chroma';
```

## Error Handling

All service functions throw a `VectorDBError` when an error occurs. This error includes the original error as the `cause` property.

```typescript
import { getVectorDBInstance, VectorDBError } from '../lib/vector-db';

try {
  const vectorDB = await getVectorDBInstance(sessionId);
} catch (error) {
  if (error instanceof VectorDBError) {
    console.error('Vector DB error:', error.message);
    console.error('Cause:', error.cause);
  }
}
```

## Extending

To add a new provider, create a new file in the `providers/` directory that implements the `VectorDBProvider` interface, and register it in the provider registry in `service.ts`.

```typescript
import { VectorDBInstance, VectorDBProvider } from '../types';

export class NewProvider implements VectorDBProvider {
  async createInstance(sessionId: number): Promise<VectorDBInstance> {
    return new NewProviderInstance(sessionId);
  }
}

class NewProviderInstance implements VectorDBInstance {
  // Implementation
}
```

## Integration with Database

The vector DB service integrates with the main database through the following functions in `db.ts`:

- **Settings Management**:
  - `saveVectorDBSettings`: Save global vector DB settings
  - `getVectorDBSettings`: Get global vector DB settings

## Implementation Notes

- The service uses a caching mechanism to avoid recreating vector DB instances for the same session
- Provider implementations handle the details of connecting to and interacting with the underlying vector DB
- The service is designed to be extensible with new providers
- All sessions use the global vector DB settings for connecting to the appropriate provider

### Direct API Usage

You can use the vector DB API directly:

```tsx
import { getVectorDBInstance } from '@/lib/vector-db';

// Get an instance for a session
const instance = await getVectorDBInstance(sessionId);

// Use the instance
const results = await instance.searchDocuments('query', { category: 'language' }, 10);
```

### Error Handling

All vector DB operations can throw errors, which should be caught and handled appropriately:

```tsx
try {
  const results = await vectorDB.searchDocuments('query');
  // Process results
} catch (error) {
  console.error('Error searching vector DB:', error);
  // Handle error
}
```
