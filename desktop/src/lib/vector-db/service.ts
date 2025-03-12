import { getVectorDBSettings, getUserSettings, getSessionVectorDBMapping } from '../db';
import { VectorDBInstance, VectorDBError, VectorDBProvider, ExtendedVectorDBSettings } from './types';
import { ChromaProvider } from './providers/chroma';
import { PineconeProvider } from './providers/pinecone';

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
  const instance = await provider.createInstance(tempSessionId, apiKey);
  
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
  // Check cache first
  const cached = instanceCache.get(sessionId);
  if (cached) return cached;

  // Get user settings for OpenAI API key
  const userSettings = await getUserSettings();
  const openAIApiKey = userSettings?.openai_key || '';
  if (!openAIApiKey) {
    throw new VectorDBError('OpenAI API key not found in user settings');
  }
  
  // Get provider mapping for session
  const sessionMapping = await getSessionVectorDBMapping(sessionId);
  const providerName = sessionMapping?.provider_name || 'chromadb';
  const provider = providers[providerName];
  
  if (!provider) {
    throw new VectorDBError(`Invalid vector DB provider: ${providerName}`);
  }

  try {
    console.log(`Initializing ${providerName} instance for session ${sessionId}`);
    const instance = await provider.createInstance(sessionId, openAIApiKey);
    instanceCache.set(sessionId, instance);
    return instance;
  } catch (error) {
    console.error(`Failed to initialize ${providerName} instance:`, error);
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