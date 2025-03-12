import { useState, useEffect, useRef } from 'react';
import { 
  VectorDBInstance, 
  VectorDBError, 
  getVectorDBInstance,
  DocumentFilter,
  UniversalDocument
} from '../lib/vector-db';
import { getSessionVectorDBMapping } from '../lib/db';

// Global cache for vector DB instances
const vectorDBCache = new Map<number, VectorDBInstance>();
const initializedSessions = new Set<number>();

// Debug flag - set to true to enable verbose logging
const DEBUG = false;

const log = {
  debug: (...args: any[]) => DEBUG && console.log('[VectorDB]:', ...args),
  error: (...args: any[]) => console.error('[VectorDB Error]:', ...args)
};

interface VectorDBHookResult {
  vectorDB: VectorDBInstance | null;
  loading: boolean;
  error: Error | null;
  isInitialized: boolean;
  providerType: string;
  addDocuments: (documents: UniversalDocument[]) => Promise<void>;
  searchDocuments: (query: string | number[], filters?: DocumentFilter, limit?: number) => Promise<UniversalDocument[]>;
  getDocumentsByFilters: (filters?: DocumentFilter, limit?: number) => Promise<UniversalDocument[]>;
  getSnippetCountForUrl: (url: string) => Promise<number>;
  updateURLStatus: (url: string, status: string) => Promise<void>;
}

/**
 * Hook for accessing a vector DB instance for a session
 */
export function useVectorDB(sessionId: number): VectorDBHookResult {
  
  // Use cached instance if available
  const [vectorDB, setVectorDB] = useState<VectorDBInstance | null>(() => vectorDBCache.get(sessionId) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialized, setIsInitialized] = useState(() => initializedSessions.has(sessionId));
  const [providerType, setProviderType] = useState<string>('');
  const initializationInProgress = useRef(false);
  const lastSessionId = useRef<number | null>(null);
  const initAttempts = useRef(0);
  const mountedRef = useRef(true);

  // Set up mounted ref
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initialization effect
  useEffect(() => {
    if (!mountedRef.current) return;

    // Reset state for invalid sessions
    if (sessionId <= 0) {
      log.debug(`No valid session selected (ID: ${sessionId})`);
      if (mountedRef.current) {
        setVectorDB(null);
        setLoading(false);
        setError(null);
        if (isInitialized) {
          setIsInitialized(false);
          initializedSessions.delete(sessionId);
          vectorDBCache.delete(sessionId);
        }
        setProviderType('');
        initAttempts.current = 0;
      }
      return;
    }

    // Use cached instance if available
    const cachedInstance = vectorDBCache.get(sessionId);
    if (cachedInstance) {
      if (!vectorDB) setVectorDB(cachedInstance);
      if (!isInitialized) {
        setIsInitialized(true);
        initializedSessions.add(sessionId);
      }
      return;
    }

    // Skip if already initialized
    if (lastSessionId.current === sessionId && vectorDB && isInitialized) {
      if (!initializedSessions.has(sessionId)) initializedSessions.add(sessionId);
      if (!vectorDBCache.has(sessionId)) vectorDBCache.set(sessionId, vectorDB);
      return;
    }

    // Skip if initialization is in progress
    if (initializationInProgress.current) {
      return;
    }

    // Prevent excessive initialization attempts
    if (initAttempts.current > 3) {
      log.error(`Too many initialization attempts for session ${sessionId}`);
      if (mountedRef.current) {
        setError(new VectorDBError('Too many initialization attempts'));
        setLoading(false);
        initializedSessions.delete(sessionId);
        vectorDBCache.delete(sessionId);
      }
      return;
    }

    // Initialize vector DB
    async function initVectorDB() {
      initializationInProgress.current = true;
      lastSessionId.current = sessionId;
      initAttempts.current++;

      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        log.debug(`Initializing vector DB for session ${sessionId} (attempt ${initAttempts.current})`);
        const instance = await getVectorDBInstance(sessionId);
        const sessionMapping = await getSessionVectorDBMapping(sessionId);
        const provider = sessionMapping?.provider_name || 'chromadb';

        if (mountedRef.current) {
          setVectorDB(instance);
          setIsInitialized(true);
          setProviderType(provider);
          setLoading(false);
          initializedSessions.add(sessionId);
          vectorDBCache.set(sessionId, instance);
        } else {
          vectorDBCache.set(sessionId, instance);
          initializedSessions.add(sessionId);
        }
      } catch (err) {
        log.error(`Initialization failed for session ${sessionId}:`, err);
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new VectorDBError(String(err)));
          setLoading(false);
          setVectorDB(null);
          setIsInitialized(false);
          setProviderType('');
          initializedSessions.delete(sessionId);
          vectorDBCache.delete(sessionId);
        }
      } finally {
        initializationInProgress.current = false;
      }
    }

    if (!isInitialized || lastSessionId.current !== sessionId) {
      initVectorDB();
    }

    return () => {
      log.debug(`Cleanup for session ${sessionId}`);
    };
  }, [sessionId, isInitialized, vectorDB]);

  // Document operations
  const addDocuments = async (documents: UniversalDocument[]): Promise<void> => {
    if (!vectorDB) throw new VectorDBError('Vector DB not initialized');
    await vectorDB.addDocuments(documents);
  };

  const searchDocuments = async (
    query: string | number[],
    filters?: DocumentFilter,
    limit?: number
  ): Promise<UniversalDocument[]> => {
    if (!vectorDB) throw new VectorDBError('Vector DB not initialized');
    return vectorDB.searchDocuments(query, filters, limit);
  };

  const getDocumentsByFilters = async (
    filters?: DocumentFilter,
    limit?: number
  ): Promise<UniversalDocument[]> => {
    if (!vectorDB) throw new VectorDBError('Vector DB not initialized');
    return vectorDB.getDocumentsByFilters(filters, limit);
  };

  const getSnippetCountForUrl = async (url: string): Promise<number> => {
    if (!vectorDB) throw new VectorDBError('Vector DB not initialized');
    if (vectorDB.getSnippetCountForUrl) {
      return vectorDB.getSnippetCountForUrl(url);
    }
    const snippets = await vectorDB.getDocumentsByFilters({ source_url: url });
    return snippets.length;
  };

  const updateURLStatus = async (url: string, status: string): Promise<void> => {
    if (!vectorDB) throw new VectorDBError('Vector DB not initialized');
    if (vectorDB.updateURLStatus) {
      await vectorDB.updateURLStatus(url, status);
      return;
    }

    // Fallback implementation
    const documents = await vectorDB.getDocumentsByFilters({ source_url: url });
    if (documents.length > 0) {
      const updatedDocuments = documents.map(doc => ({
        ...doc,
        metadata: { ...doc.metadata, status }
      }));
      await vectorDB.addDocuments(updatedDocuments);
    }
  };

  return {
    vectorDB,
    loading,
    error,
    isInitialized,
    providerType,
    addDocuments,
    searchDocuments,
    getDocumentsByFilters,
    getSnippetCountForUrl,
    updateURLStatus
  };
}