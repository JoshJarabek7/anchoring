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
import { updateURLStatusByUrl } from '../../db';
import { ChromaClient as ChromaSDKClient } from 'chromadb';

// Configuration to match MCP server
const COLLECTION_NAME = "documentation_snippets";
const VECTOR_DIMENSIONS = 3072; // OpenAI text-embedding-3-large dimensions

// ChromaDB specific document type
interface ChromaDocument {
  id: string;
  embedding: number[];
  metadata: {
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
    concepts: string;
    status?: string;
  };
  content: string;
}

export interface ChromaConfig {
  host: string;
  port: number;
  apiKey: string; // OpenAI API key for embedding generation
  collectionName?: string;
}

export class ChromaProvider implements VectorDBProvider {
  async createInstance(sessionId: number): Promise<VectorDBInstance> {
    return new ChromaInstance(sessionId);
  }
}

class ChromaInstance implements VectorDBInstance {
  private client: ChromaSDKClient | null = null;
  private collection: any = null;
  private config!: ChromaConfig;
  private initialized: boolean = false;
  
  constructor(private sessionId: number) {}
  
  async initialize(config: ChromaConfig): Promise<void> {
    try {
      this.config = config;
      
      // Get ChromaDB connection details from environment or use defaults
      const chromaHost = config.host || 'localhost';
      const chromaPort = config.port || '8001';
      const chromaUrl = `http://${chromaHost}:${chromaPort}`;
      
      console.log(`Connecting to ChromaDB at ${chromaUrl}`);
      
      // Initialize the ChromaDB client with HTTP configuration
      this.client = new ChromaSDKClient({
        path: chromaUrl,
        tenant: "default_tenant",
        database: "default_database"
      });
      
      // Create a custom embedding function that uses OpenAI
      const customEmbeddingFunction = {
        generate: async (texts: string[]): Promise<number[][]> => {
          if (!texts || texts.length === 0) return [];
          
          const embeddings: number[][] = [];
          for (const text of texts) {
            try {
              const embedding = await generateEmbedding(text, this.config.apiKey);
              embeddings.push(embedding);
            } catch (error) {
              console.error("Error generating embedding:", error);
              embeddings.push(new Array(VECTOR_DIMENSIONS).fill(0));
            }
          }
          return embeddings;
        }
      };
      
      // Verify server is healthy
      const response = await fetch(`${chromaUrl}/api/v1/heartbeat`);
      if (!response.ok) {
        throw new Error("ChromaDB server not healthy");
      }
      
      // Get or create collection
      const collections = await this.client.listCollections();
      const collectionName = config.collectionName || COLLECTION_NAME;
      
      if (collections.includes(collectionName)) {
        this.collection = await this.client.getCollection({
          name: collectionName,
          embeddingFunction: customEmbeddingFunction
        });
      } else {
        this.collection = await this.client.createCollection({
          name: collectionName,
          metadata: { 
            "description": "Documentation snippets for Anchoring project",
            "hnsw:space": "cosine"
          },
          embeddingFunction: customEmbeddingFunction
        });
      }
      
      this.initialized = true;
    } catch (error) {
      throw new VectorDBError('Failed to initialize ChromaDB provider', error as Error);
    }
  }
  
  updateApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }
  
  private _universalToChromaDocument = async (doc: UniversalDocument): Promise<ChromaDocument | null> => {
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
      const embedding = await generateEmbedding(doc.content, this.config.apiKey);
      
      // Convert to ChromaDocument format
      return {
        id: validatedDoc.snippet_id,
        embedding,
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
          status: validatedDoc.status
        },
        content: validatedDoc.content
      };
    } catch (error) {
      console.error("Error converting to ChromaDocument:", error);
      return null;
    }
  };
  
  private _chromaToUniversalDocument = (doc: any): UniversalDocument => {
    const metadata = doc.metadata || {};
    return {
      id: doc.id,
      content: doc.content || doc.documents || "",
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
      throw new VectorDBError('ChromaDB provider not initialized');
    }
    
    try {
      console.log(`Processing batch of ${documents.length} documents for ChromaDB`);
      
      // Convert UniversalDocuments to ChromaDocuments
      const processedDocs = await Promise.all(documents.map(doc => this._universalToChromaDocument(doc)));
      const validDocs = processedDocs.filter((doc): doc is NonNullable<typeof doc> => doc !== null);
      
      if (validDocs.length > 0) {
        await this.collection.add({
          ids: validDocs.map(doc => doc.id),
          embeddings: validDocs.map(doc => doc.embedding),
          metadatas: validDocs.map(doc => doc.metadata),
          documents: validDocs.map(doc => doc.content)
        });
        
        console.log(`Successfully added ${validDocs.length} documents to ChromaDB`);
      } else {
        console.error("No valid documents to add to ChromaDB");
      }
    } catch (error) {
      throw new VectorDBError('Failed to add documents to ChromaDB', error as Error);
    }
  }
  
  private _formatSearchResults(results: any): UniversalDocument[] {
    if (!results?.ids?.length) {
      return [];
    }
    
    return results.ids.map((id: string, index: number) => {
      const metadata = results.metadatas?.[index] || {};
      const content = results.documents?.[index] || "";
      const score = results.distances
        ? Math.max(0, 1.0 - (results.distances[index] / 2.0))
        : undefined;
      
      return {
        id,
        content,
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
    });
  }
  
  async searchDocuments(query: string | number[], filters?: DocumentFilter, limit: number = 10): Promise<UniversalDocument[]> {
    if (!this.initialized) {
      throw new VectorDBError('ChromaDB provider not initialized');
    }
    
    try {
      console.log(`Searching ChromaDB for: "${query}" with filters:`, filters);
      
      // Generate embedding for query if it's a string
      const queryEmbedding = typeof query === 'string' 
        ? await generateEmbedding(query, this.config.apiKey)
        : query;
      
      // Prepare filter if specified
      let whereClause = undefined;
      if (filters) {
        const validFilters = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== "");
        
        if (validFilters.length > 0) {
          whereClause = validFilters.length === 1
            ? { [validFilters[0][0]]: validFilters[0][1] }
            : { $and: validFilters.map(([key, value]) => ({ [key]: value })) };
        }
      }
      
      // Query ChromaDB
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: Math.min(limit, 10),
        ...(whereClause ? { where: whereClause } : {}),
        include: ["metadatas", "documents", "distances"]
      });
      
      return this._formatSearchResults(results);
    } catch (error) {
      throw new VectorDBError('Failed to search documents in ChromaDB', error as Error);
    }
  }
  
  async getDocumentsByFilters(filters?: DocumentFilter, limit: number = 10): Promise<UniversalDocument[]> {
    if (!this.initialized) {
      throw new VectorDBError('ChromaDB provider not initialized');
    }
    
    try {
      console.log(`Getting documents with filters:`, filters);
      
      // Prepare filter if specified
      let whereClause = undefined;
      if (filters) {
        const validFilters = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== "");
        
        if (validFilters.length > 0) {
          whereClause = validFilters.length === 1
            ? { [validFilters[0][0]]: validFilters[0][1] }
            : { $and: validFilters.map(([key, value]) => ({ [key]: value })) };
        }
      }
      
      // Query ChromaDB
      const results = await this.collection.get({
        limit: Math.min(limit, 100),
        ...(whereClause ? { where: whereClause } : {}),
        include: ["metadatas", "documents"]
      });
      
      return this._formatSearchResults(results);
    } catch (error) {
      throw new VectorDBError('Failed to get documents by filters from ChromaDB', error as Error);
    }
  }
  
  async getSnippetCountForUrl(url: string): Promise<number> {
    if (!this.initialized) {
      throw new VectorDBError('ChromaDB provider not initialized');
    }
    
    try {
      const results = await this.collection.get({
        where: { source_url: url },
        include: []
      });
      
      return results.ids.length;
    } catch (error) {
      throw new VectorDBError('Failed to get snippet count from ChromaDB', error as Error);
    }
  }
  
  async updateURLStatus(url: string, status: string): Promise<void> {
    if (!this.initialized) {
      throw new VectorDBError('ChromaDB provider not initialized');
    }
    
    try {
      // Get existing documents for this URL
      const documents = await this.getDocumentsByFilters({ url });
      
      // Update each document's metadata with the new status
      const updatedDocuments = documents.map(doc => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          status
        }
      }));
      
      // Remove old documents and add updated ones
      // Note: In a real implementation, we would use a proper update mechanism
      if (updatedDocuments.length > 0) {
        await this.addDocuments(updatedDocuments);
      }
      
      // Also update the status in the SQL database
      await updateURLStatusByUrl(url, status);
    } catch (error) {
      throw new VectorDBError(`Failed to update URL status in ChromaDB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  isAvailable(): boolean {
    return this.initialized;
  }
  
  getContextType(): ContextType {
    return ContextType.LOCAL;
  }
} 