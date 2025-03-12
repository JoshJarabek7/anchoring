import { 
  ContextType,
  DocumentFilter,
  VectorDBError,
  VectorDBInstance,
  VectorDBProvider,
  UniversalDocument,
  DocumentSchema,
  DocumentCategory
} from '../types';
import { generateEmbedding } from '../../openai';
import { invoke } from '@tauri-apps/api/core';

// Pinecone specific document type
interface PineconeDocument {
  id: string;
  values: number[];
  metadata: {
    content: string;
    category: DocumentCategory;
    language?: string;
    language_version?: string;
    framework?: string;
    framework_version?: string;
    library?: string;
    library_version?: string;
    title: string;
    description: string;
    source_url: string;
    concepts?: string;
    status?: string;
  };
}

export interface PineconeConfig {
  apiKey: string;
  indexName: string;
  openAIApiKey: string;
}

interface PineconeIndex {
  upsert(params: { vectors: PineconeDocument[] }): Promise<void>;
  query(params: { vector: number[], topK: number, includeMetadata: boolean, filter?: Record<string, any> }): Promise<{ matches?: Array<{ id: string, metadata: Record<string, any>, score: number }> }>;
  fetch(params: { ids: string[], filter?: Record<string, any>, limit?: number }): Promise<{ vectors: Record<string, { metadata: Record<string, any> }> }>;
}

export class PineconeProvider implements VectorDBProvider {
  async createInstance(sessionId: number): Promise<VectorDBInstance> {
    return new PineconeInstance(sessionId);
  }
}

class PineconeInstance implements VectorDBInstance {
  private config!: PineconeConfig;
  private initialized: boolean = false;
  private index!: PineconeIndex;
  
  constructor(private sessionId: number) {}
  
  async initialize(config: PineconeConfig): Promise<void> {
    try {
      if (!config) {
        throw new VectorDBError('Configuration is required for Pinecone initialization');
      }
      
      if (!config.apiKey) {
        throw new VectorDBError('API key is required for Pinecone initialization');
      }
      
      if (!config.indexName) {
        throw new VectorDBError('Index name is required for Pinecone initialization');
      }
      
      if (!config.openAIApiKey) {
        throw new VectorDBError('OpenAI API key is required for Pinecone initialization');
      }
      
      this.config = config;
      
      // Log the configuration being sent to Rust
      console.log('Initializing Pinecone with config:', {
        sessionId: this.sessionId,
        config: {
          api_key: config.apiKey ? `${config.apiKey.substring(0, 5)}...` : 'missing',
          index_name: config.indexName || 'missing'
        }
      });
      
      // Initialize Pinecone using Tauri command
      await invoke('initialize_vector_db', {
        sessionId: this.sessionId,
        config: {
          api_key: config.apiKey,
          index_name: config.indexName
        }
      });

      console.log('Pinecone initialized successfully');
      this.initialized = true;
    } catch (error) {
      console.error('Pinecone initialization error:', error);
      throw new VectorDBError('Failed to initialize Pinecone provider', error as Error);
    }
  }
  
  private _universalToPineconeDocument = async (doc: UniversalDocument): Promise<PineconeDocument | null> => {
    try {
      // Validate document
      const validatedDoc = DocumentSchema.parse({
        category: doc.metadata.category,
        language: doc.metadata.language,
        language_version: doc.metadata.language_version,
        framework: doc.metadata.framework,
        framework_version: doc.metadata.framework_version,
        library: doc.metadata.library,
        library_version: doc.metadata.library_version,
        snippet_id: doc.id,
        source_url: doc.metadata.source_url,
        title: doc.metadata.title,
        description: doc.metadata.description,
        content: doc.content,
        concepts: doc.metadata.concepts,
        status: doc.metadata.status
      });
      
      // Generate embedding
      const values = await generateEmbedding(doc.content, this.config.apiKey);
      
      // Convert to PineconeDocument format
      return {
        id: validatedDoc.snippet_id,
        values,
        metadata: {
          category: validatedDoc.category,
          language: validatedDoc.language,
          language_version: validatedDoc.language_version,
          framework: validatedDoc.framework,
          framework_version: validatedDoc.framework_version,
          library: validatedDoc.library,
          library_version: validatedDoc.library_version,
          title: validatedDoc.title,
          description: validatedDoc.description,
          source_url: validatedDoc.source_url,
          concepts: validatedDoc.concepts ? validatedDoc.concepts.join(",") : "",
          content: validatedDoc.content,
          status: validatedDoc.status
        }
      };
    } catch (error) {
      console.error("Error converting to PineconeDocument:", error);
      return null;
    }
  };
  
  private _pineconeToPineconeDocument = (doc: any): UniversalDocument => {
    const metadata = doc.metadata || {};
    return {
      id: doc.id,
      content: metadata.content || "",
      metadata: {
        category: metadata.category,
        language: metadata.language,
        language_version: metadata.language_version,
        framework: metadata.framework,
        framework_version: metadata.framework_version,
        library: metadata.library,
        library_version: metadata.library_version,
        title: metadata.title || "Untitled",
        description: metadata.description || "",
        source_url: metadata.source_url,
        concepts: metadata.concepts ? metadata.concepts.split(",") : [],
        status: metadata.status
      }
    };
  };
  
  async addDocuments(documents: UniversalDocument[]): Promise<void> {
    if (!this.initialized) {
      throw new VectorDBError('Pinecone provider not initialized');
    }
    
    try {
      console.log(`Processing batch of ${documents.length} documents for Pinecone`);
      
      // Convert UniversalDocuments to PineconeDocuments
      const processedDocs = await Promise.all(documents.map(doc => this._universalToPineconeDocument(doc)));
      const validDocs = processedDocs.filter((doc): doc is NonNullable<typeof doc> => doc !== null);
      
      if (validDocs.length > 0) {
        // Pinecone upsert expects an array of vectors
        await this.index.upsert({
          vectors: validDocs
        });
        
        console.log(`Successfully added ${validDocs.length} documents to Pinecone`);
      } else {
        console.error("No valid documents to add to Pinecone");
      }
    } catch (error) {
      throw new VectorDBError('Failed to add documents to Pinecone', error as Error);
    }
  }
  
  async searchDocuments(query: string | number[], filters?: DocumentFilter, limit: number = 10): Promise<UniversalDocument[]> {
    if (!this.initialized) {
      throw new VectorDBError('Pinecone provider not initialized');
    }
    
    try {
      console.log(`Searching Pinecone for: "${query}" with filters:`, filters);
      
      // Generate embedding for query if it's a string
      const vector = typeof query === 'string' 
        ? await generateEmbedding(query, this.config.apiKey)
        : query;
      
      // Prepare filter if specified
      let filter = undefined;
      if (filters) {
        const validFilters = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== "");
        
        if (validFilters.length > 0) {
          filter = validFilters.reduce((acc, [key, value]) => {
            acc[key] = { $eq: value };
            return acc;
          }, {} as Record<string, any>);
        }
      }
      
      // Query Pinecone
      const results = await this.index.query({
        vector,
        topK: Math.min(limit, 10),
        includeMetadata: true,
        ...(filter ? { filter } : {})
      });
      
      // Convert results to UniversalDocument format
      if (!results.matches?.length) {
        return [];
      }
      
      return results.matches.map(match => {
        const doc = {
          id: match.id,
          metadata: match.metadata,
          score: match.score
        };
        return this._pineconeToPineconeDocument(doc);
      });
    } catch (error) {
      throw new VectorDBError('Failed to search documents in Pinecone', error as Error);
    }
  }
  
  async getDocumentsByFilters(filters?: DocumentFilter, limit: number = 10): Promise<UniversalDocument[]> {
    if (!this.initialized) {
      throw new VectorDBError('Pinecone provider not initialized');
    }
    
    try {
      console.log(`Getting documents with filters:`, filters);
      
      // Prepare filter if specified
      let filter = undefined;
      if (filters) {
        const validFilters = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== "");
        
        if (validFilters.length > 0) {
          filter = validFilters.reduce((acc, [key, value]) => {
            acc[key] = { $eq: value };
            return acc;
          }, {} as Record<string, any>);
        }
      }
      
      // Query Pinecone
      const results = await this.index.fetch({
        ids: [], // Empty array to fetch all vectors
        ...(filter ? { filter } : {}),
        limit: Math.min(limit, 100)
      });
      
      if (!Object.keys(results.vectors).length) {
        console.log('No documents found matching filters');
        return [];
      }
      
      // Convert results to UniversalDocument format
      return Object.entries(results.vectors).map(([id, vector]) => {
        const doc = {
          id,
          metadata: vector.metadata
        };
        return this._pineconeToPineconeDocument(doc);
      });
    } catch (error) {
      throw new VectorDBError('Failed to get documents by filters from Pinecone', error as Error);
    }
  }
  
  async getSnippetCountForUrl(url: string): Promise<number> {
    if (!this.initialized) {
      throw new VectorDBError('Pinecone provider not initialized');
    }
    
    try {
      const results = await this.getDocumentsByFilters({ source_url: url });
      return results.length;
    } catch (error) {
      throw new VectorDBError('Failed to get snippet count from Pinecone', error as Error);
    }
  }
  
  async updateURLStatus(url: string, status: string): Promise<void> {
    if (!this.initialized) {
      throw new VectorDBError('Pinecone provider not initialized');
    }
    
    try {
      // Get documents by URL
      const documents = await this.getDocumentsByFilters({ source_url: url });
      
      // Update each document's metadata with the new status
      const updatedDocuments = documents.map(doc => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          status
        }
      }));
      
      // Re-add the updated documents
      if (updatedDocuments.length > 0) {
        await this.addDocuments(updatedDocuments);
      }
    } catch (error) {
      throw new VectorDBError(`Failed to update URL status in Pinecone: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  isAvailable(): boolean {
    return this.initialized;
  }
  
  getContextType(): ContextType {
    return ContextType.SHARED;
  }
} 