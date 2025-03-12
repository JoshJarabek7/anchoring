import { getVectorDBSettings, getUserSettings, getSessionVectorDBMapping } from '../db';
import { VectorDBInstance, VectorDBError, VectorDBProvider } from './types';
import { ChromaProvider } from './providers/chroma';
import { PineconeProvider } from './providers/pinecone';

// Extend the VectorDBSettings type to include openai_key
interface ExtendedVectorDBSettings {
  pinecone_api_key: string;
  pinecone_index: string;
  openai_key?: string;
}

// Cache of vector DB instances
const instanceCache = new Map<number, VectorDBInstance>();

// Simple provider registry
const providers: Record<string, VectorDBProvider> = {
  'chromadb': new ChromaProvider(),
  'pinecone': new PineconeProvider()
};

/**
 * Create a vector DB instance with an API key
 */
export async function createProviderWithKey(apiKey: string): Promise<VectorDBInstance> {
  // Get global vector DB settings
  const settings = await getVectorDBSettings() as ExtendedVectorDBSettings;
  
  // Use Pinecone as the default provider
  const provider = providers['pinecone'];
  if (!provider) {
    throw new VectorDBError(`Invalid vector DB provider: pinecone`);
  }

  // Create instance with a temporary session ID
  const tempSessionId = Date.now(); // Use timestamp as temporary session ID
  const instance = await provider.createInstance(tempSessionId);
  
  // Initialize with the provided API key
  await instance.initialize({
    apiKey: settings.pinecone_api_key,
    indexName: settings.pinecone_index,
    openAIApiKey: apiKey // Use the provided API key
  });

  return instance;
}

/**
 * Get a vector DB instance for a session
 */
export async function getVectorDBInstance(sessionId: number): Promise<VectorDBInstance> {
  console.log(`getVectorDBInstance called for session ${sessionId}`);
  
  // Check cache first
  const cached = instanceCache.get(sessionId);
  if (cached) {
    console.log(`getVectorDBInstance: Cache hit for session ${sessionId}`);
    return cached;
  }
  console.log(`getVectorDBInstance: Cache miss for session ${sessionId}, creating new instance`);

  // Get global vector DB settings
  console.log(`getVectorDBInstance: Fetching vector DB settings for session ${sessionId}`);
  const settings = await getVectorDBSettings() as ExtendedVectorDBSettings;
  console.log(`getVectorDBInstance: Vector DB settings loaded:`, {
    hasPineconeApiKey: !!settings.pinecone_api_key,
    hasPineconeIndex: !!settings.pinecone_index,
  });
  
  // Get user settings to get the OpenAI API key
  console.log(`getVectorDBInstance: Fetching user settings for session ${sessionId}`);
  const userSettings = await getUserSettings();
  const openAIApiKey = userSettings?.openai_key || '';
  
  // Log the API key for debugging (first and last few characters)
  if (openAIApiKey) {
    console.log(`getVectorDBInstance: Using OpenAI API key: ${openAIApiKey.substring(0, 5)}...${openAIApiKey.substring(openAIApiKey.length - 4)}`);
  } else {
    console.error("getVectorDBInstance: No OpenAI API key found in user settings");
  }
  
  // Get the provider mapping for this session
  const sessionMapping = await getSessionVectorDBMapping(sessionId);
  console.log(`getVectorDBInstance: Session mapping for ${sessionId}:`, sessionMapping);
  
  // Use the mapped provider if it exists, otherwise default to chromadb
  const providerName = sessionMapping?.provider_name || 'chromadb';
  
  console.log(`getVectorDBInstance: Using provider ${providerName} for session ${sessionId}`);
  
  const provider = providers[providerName];
  if (!provider) {
    const error = new VectorDBError(`Invalid vector DB provider: ${providerName}`);
    console.error(`getVectorDBInstance: ${error.message}`);
    throw error;
  }

  try {
    // Create instance
    console.log(`getVectorDBInstance: Creating instance with provider ${providerName} for session ${sessionId}`);
    const instance = await provider.createInstance(sessionId);
    
    // Configure the instance based on the provider type
    if (providerName === 'pinecone') {
      // Validate Pinecone settings - ensure we have actual values, not just empty strings
      const hasPineconeSettings = settings.pinecone_api_key?.trim() && 
                                settings.pinecone_index?.trim();
                                
      if (!hasPineconeSettings) {
        const error = new VectorDBError('Pinecone settings are not properly configured. Please check your settings.');
        console.error(`getVectorDBInstance: ${error.message}`);
        throw error;
      }
      
      console.log(`getVectorDBInstance: Initializing Pinecone instance for session ${sessionId}`);
      await instance.initialize({
        apiKey: settings.pinecone_api_key,
        indexName: settings.pinecone_index,
        openAIApiKey: openAIApiKey // Use the OpenAI API key from user settings
      });
    } else {
      // ChromaDB configuration
      console.log(`getVectorDBInstance: Initializing ChromaDB instance for session ${sessionId}`);
      await instance.initialize({
        host: 'localhost', // Default ChromaDB host
        port: 8000, // Default ChromaDB port
        apiKey: openAIApiKey, // OpenAI API key for embeddings
        collectionName: `session-${sessionId}`
      });
    }

    console.log(`getVectorDBInstance: Successfully initialized ${providerName} instance for session ${sessionId}`);

    // Cache instance
    instanceCache.set(sessionId, instance);
    console.log(`getVectorDBInstance: Cached instance for session ${sessionId}`);

    return instance;
  } catch (error) {
    console.error(`getVectorDBInstance: Error creating/initializing instance for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Clear the vector DB instance cache for a session
 */
export function clearVectorDBInstanceCache(sessionId: number): void {
  instanceCache.delete(sessionId);
}

/**
 * Clear all vector DB instance caches
 */
export function clearAllVectorDBInstanceCaches(): void {
  instanceCache.clear();
} 