/**
 * ChromaDB client wrapper for Anchoring
 * 
 * This is a client-side implementation to interact with ChromaDB
 * which should match the server-side implementation in the MCP server.
 */

import { z } from "zod";
import { DocumentationCategory, FullDocumentationSnippet } from "./db";
import { generateEmbedding, processDocumentForEmbedding } from "./openai";
import { ChromaClient as ChromaSDKClient } from "chromadb";

// Configuration to match MCP server (from app/server.py)
const COLLECTION_NAME = "documentation_snippets";
const VECTOR_DIMENSIONS = 3072; // OpenAI text-embedding-3-large dimensions

// Schema for validating documentation data
const DocumentationSchema = z.object({
  category: z.enum(["language", "framework", "library"]),
  language: z.string().optional(),
  language_version: z.string().optional(),
  framework: z.string().optional(),
  framework_version: z.string().optional(),
  library: z.string().optional(),
  library_version: z.string().optional(),
  snippet_id: z.string(),
  source_url: z.string(),
  title: z.string(),
  description: z.string(),
  content: z.string(),
  concepts: z.array(z.string()).optional(),
});

// Helper function to generate a random ID
const generateSnippetId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

/**
 * ChromaDB client class for interacting with the vector database
 */
export class ChromaClient {
  private apiKey: string;
  private dbLoaded: boolean = false;
  private client: ChromaSDKClient | null = null;
  private collection: any = null; // Type will be Collection from ChromaDB

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Initialize the ChromaDB client and check if it's accessible
   */
  async initialize(): Promise<boolean> {
    try {
      console.log("Initializing ChromaDB client via HTTP endpoint");

      // Create a custom embedding function that uses OpenAI
      const customEmbeddingFunction = {
        // This matches the IEmbeddingFunction interface expected by ChromaDB TypeScript
        generate: async (texts: string[]): Promise<number[][]> => {
          if (!texts || texts.length === 0) return [];
          
          // Generate embeddings for each text using OpenAI
          const embeddings: number[][] = [];
          for (const text of texts) {
            try {
              const embedding = await generateEmbedding(
                text,
                this.apiKey,
                "text-embedding-3-large",
                VECTOR_DIMENSIONS
              );
              embeddings.push(embedding);
            } catch (error) {
              console.error("Error generating embedding:", error);
              // Return a zeroed embedding in case of error to avoid crashing
              embeddings.push(new Array(VECTOR_DIMENSIONS).fill(0));
            }
          }
          return embeddings;
        }
      };
      
      // Get ChromaDB connection details from environment or use defaults
      const chromaHost = (import.meta.env.VITE_CHROMA_HOST || 'localhost');
      const chromaPort = (import.meta.env.VITE_CHROMA_PORT || '8001');
      const chromaUrl = `http://${chromaHost}:${chromaPort}`;
      
      console.log(`Connecting to ChromaDB at ${chromaUrl}`);
      
      // Initialize the ChromaDB client with HTTP configuration
      // Connect to the running server instead of using filesystem path
      this.client = new ChromaSDKClient({
        path: chromaUrl,
        tenant: "default_tenant",
        database: "default_database"
      });
      
      console.log("ChromaDB client initialized");
      
      // Verify server is healthy by fetching the heartbeat
      try {
        // Make a simple fetch request to check server health
        const response = await fetch(`${chromaUrl}/api/v1/heartbeat`);
        if (!response.ok) {
          console.error("ChromaDB server not responding correctly. Status:", response.status);
          throw new Error("ChromaDB server not healthy");
        }
        const data = await response.json();
        console.log("ChromaDB server health check:", data);
      } catch (healthError) {
        console.error("Failed to connect to ChromaDB server:", healthError);
        throw new Error(`Failed to connect to ChromaDB server. Make sure the ChromaDB container is running on ${chromaUrl}`);
      }
      
      try {
        // First check if collection exists
        console.log("Checking if collection exists:", COLLECTION_NAME);
        
        let collectionExists = false;
        try {
          // List all collections to check if ours exists
          const collections = await this.client.listCollections();
          console.log("Available collections:", collections);
          
          // Collections is an array of strings (collection names)
          collectionExists = collections.includes(COLLECTION_NAME);
          
          if (collectionExists) {
            console.log("Collection exists, retrieving it");
            this.collection = await this.client.getCollection({
              name: COLLECTION_NAME,
              embeddingFunction: customEmbeddingFunction
            });
            console.log("Successfully retrieved collection");
          }
        } catch (listError) {
          console.error("Error listing collections:", listError);
          collectionExists = false;
        }
        
        if (!collectionExists) {
          console.log("Collection doesn't exist, creating new one:", COLLECTION_NAME);
          
          // Create a new collection
          try {
            this.collection = await this.client.createCollection({
              name: COLLECTION_NAME,
              metadata: { 
                "description": "Documentation snippets for Anchoring project",
                "hnsw:space": "cosine",           // Cosine distance for text embeddings
                "hnsw:construction_ef": 1000,     // Extremely high for maximum index quality (default: 100)
                "hnsw:M": 128,                    // Very high connectivity (default: 16)
                "hnsw:search_ef": 500,            // Exhaustive search exploration (default: 10)
                "hnsw:num_threads": 16,           // High parallelism for construction
                "hnsw:resize_factor": 1.2,        // Standard resize factor
                "hnsw:batch_size": 500,           // Larger batch size for better indexing
                "hnsw:sync_threshold": 2000       // Higher threshold for fewer disk syncs
              },
              embeddingFunction: customEmbeddingFunction
            });
            console.log("Successfully created collection with custom embedding function");
          } catch (createError) {
            console.error("Error creating collection with custom embeddings:", createError);
            
            // Try creating without custom embedding function as fallback
            console.log("Trying to create collection without custom embedding function");
            this.collection = await this.client.createCollection({
              name: COLLECTION_NAME,
              metadata: { 
                "description": "Documentation snippets for Anchoring project",
                "hnsw:space": "cosine",           // Cosine distance for text embeddings
                "hnsw:construction_ef": 1000,     // Extremely high for maximum index quality (default: 100)
                "hnsw:M": 128,                    // Very high connectivity (default: 16)
                "hnsw:search_ef": 500,            // Exhaustive search exploration (default: 10)
                "hnsw:num_threads": 16,           // High parallelism for construction
                "hnsw:resize_factor": 1.2,        // Standard resize factor
                "hnsw:batch_size": 500,           // Larger batch size for better indexing
                "hnsw:sync_threshold": 2000       // Higher threshold for fewer disk syncs
              }
            });
            
            console.log("Created collection without custom embedding function");
            // After creating, attach our embedding function
            this.collection.embeddingFunction = customEmbeddingFunction;
          }
          console.log("Created new collection");
        }
        
        this.dbLoaded = true;
        return true;
      } catch (error) {
        console.error("Error setting up collection:", error);
        return false;
      }
    } catch (error) {
      console.error("Error initializing ChromaDB client:", error);
      return false;
    }
  }

  /**
   * Add a document to ChromaDB
   */
  async addDocument(doc: FullDocumentationSnippet, verbose: boolean = true): Promise<boolean> {
    if (verbose) {
      console.log("================================");
      console.log("ADDING DOCUMENT TO CHROMADB");
      console.log("================================");
      console.log(`Document ID: ${doc.snippet_id || 'Not provided, will generate'}`);
      console.log(`Title: ${doc.title}`);
      console.log(`Category: ${doc.category}`);
      console.log(`Source URL: ${doc.source_url}`);
      console.log(`Content length: ${doc.content.length} characters`);
    }
    
    const startTime = performance.now();
    
    try {
      // Validate the document with our schema
      if (verbose) console.log("Validating document schema");
      const snippetId = doc.snippet_id || generateSnippetId();
      
      const validatedDoc = DocumentationSchema.parse({
        category: doc.category,
        language: doc.language,
        language_version: doc.language_version,
        framework: doc.framework,
        framework_version: doc.framework_version,
        library: doc.library,
        library_version: doc.library_version,
        snippet_id: snippetId,
        source_url: doc.source_url,
        title: doc.title,
        description: doc.description,
        content: doc.content,
        concepts: doc.concepts || [],
      });
      
      if (verbose) console.log(`Using snippet_id: ${validatedDoc.snippet_id}`);

      if (!this.collection) {
        console.error("❌ ChromaDB collection not initialized");
        throw new Error("ChromaDB collection not initialized");
      }
      
      if (verbose) console.log("Collection available, proceeding with document addition");

      // Generate embedding for the document content
      if (verbose) {
        console.log("Generating embedding for document content");
        console.log(`Content size: ${validatedDoc.content.length} chars`);
      }
      
      const embeddingStartTime = performance.now();
      const embedding = await processDocumentForEmbedding(
        validatedDoc.content,
        this.apiKey
      );
      const embeddingEndTime = performance.now();
      
      if (verbose) {
        console.log(`✅ Generated embedding in ${(embeddingEndTime - embeddingStartTime).toFixed(2)}ms`);
        console.log(`Embedding dimensions: ${embedding.length}`);
      }

      // Prepare metadata for document
      const metadata = {
        category: validatedDoc.category,
        language: validatedDoc.language,
        language_version: validatedDoc.language_version,
        framework: validatedDoc.framework,
        framework_version: validatedDoc.framework_version,
        library: validatedDoc.library,
        library_version: validatedDoc.library_version,
        title: validatedDoc.title,
        source_url: validatedDoc.source_url,
        concepts: validatedDoc.concepts ? validatedDoc.concepts.join(",") : "",
      };
      
      if (verbose) console.log("Adding document to ChromaDB collection");
      
      // Add document to ChromaDB with explicit embedding, no fallbacks
      const addStartTime = performance.now();
      await this.collection.add({
        ids: [validatedDoc.snippet_id],
        embeddings: [embedding],
        metadatas: [metadata],
        documents: [validatedDoc.content]
      });
      const addEndTime = performance.now();
      
      if (verbose) {
        console.log(`✅ Added document with explicit embedding in ${(addEndTime - addStartTime).toFixed(2)}ms`);
        const endTime = performance.now();
        console.log(`✅ Successfully added document to ChromaDB: ${validatedDoc.snippet_id}`);
        console.log(`Total time: ${(endTime - startTime).toFixed(2)}ms`);
      }
      
      return true;
    } catch (error) {
      const endTime = performance.now();
      console.error(`❌ Error adding document to ChromaDB in ${(endTime - startTime).toFixed(2)}ms:`, error);
      
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
      }
      return false;
    }
  }

  /**
   * Add multiple documents to ChromaDB in batch with optimized parallel processing
   */
  async addDocuments(docs: FullDocumentationSnippet[]): Promise<boolean> {
    try {
      if (!this.collection) {
        throw new Error("ChromaDB collection not initialized");
      }

      if (docs.length === 0) return true;
      
      console.log(`Adding batch of ${docs.length} documents to ChromaDB with optimized parallel processing`);
      const startTime = performance.now();

      // Prepare all documents and embeddings in parallel batches
      const BATCH_SIZE = 5; // Process 5 docs at a time for embedding generation
      const processedDocs: { id: string; embedding: number[]; metadata: any; content: string }[] = [];
      
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(docs.length/BATCH_SIZE)} for embeddings`);
        
        // Generate embeddings in parallel for this batch
        const batchPromises = batch.map(async (doc) => {
          try {
            // Validate with minimal logging
            const snippetId = doc.snippet_id || generateSnippetId();
            const validatedDoc = DocumentationSchema.parse({
              category: doc.category,
              language: doc.language, 
              language_version: doc.language_version,
              framework: doc.framework,
              framework_version: doc.framework_version,
              library: doc.library,
              library_version: doc.library_version,
              snippet_id: snippetId,
              source_url: doc.source_url,
              title: doc.title,
              description: doc.description,
              content: doc.content,
              concepts: doc.concepts || [],
            });
            
            // Generate embedding
            const embedding = await processDocumentForEmbedding(
              validatedDoc.content,
              this.apiKey
            );
            
            // Prepare metadata
            const metadata = {
              category: validatedDoc.category,
              language: validatedDoc.language,
              language_version: validatedDoc.language_version,
              framework: validatedDoc.framework,
              framework_version: validatedDoc.framework_version,
              library: validatedDoc.library,
              library_version: validatedDoc.library_version,
              title: validatedDoc.title,
              source_url: validatedDoc.source_url,
              concepts: validatedDoc.concepts ? validatedDoc.concepts.join(",") : "",
            };
            
            return {
              id: validatedDoc.snippet_id,
              embedding: embedding,
              metadata: metadata,
              content: validatedDoc.content
            };
          } catch (error) {
            console.error("Error processing document for batch:", error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        // Filter out any nulls from errors
        processedDocs.push(...batchResults.filter((doc): doc is NonNullable<typeof doc> => doc !== null));
      }
      
      // Now add all processed documents to ChromaDB in one operation
      if (processedDocs.length > 0) {
        console.log(`Adding ${processedDocs.length} documents to ChromaDB in single batch operation`);
        
        await this.collection.add({
          ids: processedDocs.map(doc => doc.id),
          embeddings: processedDocs.map(doc => doc.embedding),
          metadatas: processedDocs.map(doc => doc.metadata),
          documents: processedDocs.map(doc => doc.content)
        });
        
        const endTime = performance.now();
        console.log(`✅ Successfully added ${processedDocs.length} documents to ChromaDB in ${((endTime - startTime)/1000).toFixed(2)}s`);
      } else {
        console.error("❌ No documents were successfully processed for addition to ChromaDB");
      }
      
      return processedDocs.length > 0;
    } catch (error) {
      console.error("Error adding documents to ChromaDB:", error);
      return false;
    }
  }

  /**
   * Search for documents in ChromaDB
   */
  async searchDocuments(
    query: string,
    filters?: {
      category?: DocumentationCategory;
      language?: string;
      language_version?: string;
      framework?: string;
      framework_version?: string;
      library?: string;
      library_version?: string;
    },
    limit: number = 5
  ): Promise<FullDocumentationSnippet[]> {
    try {
      console.log(`🔍 Searching ChromaDB for: "${query}" with filters:`, filters);
      
      // Debug API key status
      console.log(`API key provided: ${this.apiKey ? "Yes (length: " + this.apiKey.length + ")" : "No"}`);
      
      // First check our instance API key
      let effectiveApiKey = this.apiKey;
      
      // If no instance API key, try environment variable
      if (!effectiveApiKey || effectiveApiKey.trim() === "") {
        const envApiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (envApiKey) {
          console.log(`Using API key from environment variable (length: ${envApiKey.length})`);
          effectiveApiKey = envApiKey;
        }
      }
      
      if (!effectiveApiKey || effectiveApiKey.trim() === "") {
        console.error("❌ No API key provided for OpenAI embeddings");
        throw new Error("OpenAI API key is required for searching (used for embeddings)");
      }
      
      if (!this.collection) {
        throw new Error("ChromaDB collection not initialized");
      }

      // Reset any temporary vars to help GC
      let queryEmbedding = null;
      let results = null;
      
      try {
        // Generate embedding for the query
        console.log("Generating embedding for query...");
        console.log(`Using API key for embeddings (first 4 chars: ${effectiveApiKey.substring(0, 4)}...)`);
        
        queryEmbedding = await generateEmbedding(
          query,
          effectiveApiKey,
          "text-embedding-3-large",
          3072 // Default dimensions
        );
        console.log("Embedding generated successfully");
  
        // Prepare filter if specified
        let whereClause = undefined;
        if (filters) {
          const validFilters = Object.entries(filters)
            .filter(([_, value]) => value !== undefined && value !== "");
          
          if (validFilters.length > 0) {
            // ChromaDB requires specific format for where clause
            if (validFilters.length === 1) {
              const [key, value] = validFilters[0];
              whereClause = { [key]: value };
            } else {
              // Multiple filters need $and operator
              whereClause = {
                $and: validFilters.map(([key, value]) => ({ [key]: value }))
              };
            }
            console.log("Using where clause:", whereClause);
          }
        }
  
        // Query ChromaDB - limit results to save memory
        console.log(`Querying ChromaDB with limit: ${Math.min(limit, 10)}`);
        results = await this.collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: Math.min(limit, 10), // Never return more than 10 results
          ...(whereClause ? { where: whereClause } : {})
        });
        
        // Log some information about the results
        console.log(`ChromaDB query returned: ${results?.ids?.[0]?.length || 0} results`);
        
        // Release embedding immediately to help memory
        queryEmbedding = null;
      } catch (err) {
        console.error("Error during search operation:", err);
        throw err;
      }

      // Map results to FullDocumentationSnippet objects
      if (results && results.ids && results.ids.length > 0 && results.ids[0].length > 0) {
        const snippets: FullDocumentationSnippet[] = [];
        
        // Log distances for debugging
        if (results.distances && results.distances[0]) {
          console.log("Search result distances:", results.distances[0]);
        }
        
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const metadata = results.metadatas[0][i];
          const content = results.documents[0][i];
          // Get the similarity score if available
          // For cosine distance, convert from 0-2 range to 0-1 range
          // Where 0 distance → 1.0 score, 2 distance → 0.0 score
          const score = results.distances && results.distances[0] ? 
            Math.max(0, 1.0 - (results.distances[0][i] / 2.0)) : 0.5; // default score if no distance
          
          console.log(`Result ${i+1}: ID=${id}, Score=${score.toFixed(4)}, Title=${metadata.title}`);
          
          // Truncate content to avoid massive memory usage
          const truncatedContent = content.length > 10000 ? 
            content.substring(0, 10000) + "... [Content truncated to save memory]" : 
            content;
          
          snippets.push({
            snippet_id: id,
            category: metadata.category as DocumentationCategory,
            language: metadata.language,
            language_version: metadata.language_version,
            framework: metadata.framework,
            framework_version: metadata.framework_version,
            library: metadata.library,
            library_version: metadata.library_version,
            title: metadata.title,
            source_url: metadata.source_url,
            description: content.substring(0, 150) + "...", // Shorter description
            content: truncatedContent,
            concepts: metadata.concepts ? metadata.concepts.split(",") : [],
            score: score // Add the similarity score to the snippet
          });
        }
        
        // Help GC clean up
        results = null;
        
        return snippets;
      }
      
      return [];
    } catch (error) {
      console.error("Error searching ChromaDB:", error);
      return [];
    } finally {
      // Additional cleanup
      if (this.client && typeof (this.client as any).close === 'function') {
        try {
          (this.client as any).close();
        } catch (e) {
          console.error("Error closing ChromaDB client:", e);
        }
      }
    }
  }

  /**
   * Get all available languages, frameworks, or libraries in the database
   */
  async getAvailableComponents(category: DocumentationCategory): Promise<Array<{name: string, version: string}>> {
    try {
      if (!this.collection) {
        throw new Error("ChromaDB collection not initialized");
      }

      console.log(`Getting available components for category: ${category}`);
      
      // First, let's debug inspect the collection to see what we're working with
      await this.debugInspectCollection(10);

      // Get distinct values based on category type
      let fieldName: string;
      let versionFieldName: string;
      switch (category) {
        case "language":
          fieldName = "language";
          versionFieldName = "language_version";
          break;
        case "framework":
          fieldName = "framework";
          versionFieldName = "framework_version";
          break;
        case "library":
          fieldName = "library";
          versionFieldName = "library_version";
          break;
        default:
          return [];
      }

      console.log(`Looking for field: ${fieldName}`);
      
      // Based on our analysis, it looks like all data is stored under "framework" category
      // So we'll modify our approach to handle this data structure issue
      
      // Try getting all documents and filter in code
      try {
        console.log(`Getting all metadatas without filtering by category (data structure workaround)`);
        const results = await this.collection.get({
          include: ["metadatas"],
          limit: 1000
        });
        
        console.log(`Got ${results.metadatas?.length || 0} document metadatas`);
        
        // First collect all possible category values to understand the data
        const categories = new Set<string>();
        for (const metadata of results.metadatas || []) {
          if (metadata && metadata.category) {
            categories.add(String(metadata.category));
          }
        }
        console.log(`Found these category values in the data:`, Array.from(categories));
        
        // Create a map to store unique component-version pairs
        const componentVersionMap = new Map<string, Set<string>>();
        
        // Search based on what kind of component we're looking for
        if (category === DocumentationCategory.FRAMEWORK) {
          // For frameworks, we use the actual framework field
          for (const metadata of results.metadatas || []) {
            if (metadata && metadata.framework) {
              const name = metadata.framework;
              const version = metadata.framework_version || "";
              
              if (!componentVersionMap.has(name)) {
                componentVersionMap.set(name, new Set());
              }
              componentVersionMap.get(name)?.add(version);
            }
          }
        } else if (category === DocumentationCategory.LANGUAGE) {
          // For languages, look at all documents
          for (const metadata of results.metadatas || []) {
            if (metadata && metadata.language) {
              const name = metadata.language;
              const version = metadata.language_version || "";
              
              if (!componentVersionMap.has(name)) {
                componentVersionMap.set(name, new Set());
              }
              componentVersionMap.get(name)?.add(version);
            }
          }
        } else if (category === DocumentationCategory.LIBRARY) {
          // For libraries, we might need to look at the actual content
          // First try the library field
          for (const metadata of results.metadatas || []) {
            if (metadata && metadata.library) {
              const name = metadata.library;
              const version = metadata.library_version || "";
              
              if (!componentVersionMap.has(name)) {
                componentVersionMap.set(name, new Set());
              }
              componentVersionMap.get(name)?.add(version);
            }
          }
          
          // If no libraries found, check for known libraries in the framework field
          if (componentVersionMap.size === 0) {
            const knownLibraries = ["React", "Vue", "Angular", "jQuery", "lodash", "Redux"];
            for (const metadata of results.metadatas || []) {
              if (metadata && metadata.framework && knownLibraries.includes(metadata.framework)) {
                const name = metadata.framework;
                const version = metadata.framework_version || "";
                
                if (!componentVersionMap.has(name)) {
                  componentVersionMap.set(name, new Set());
                }
                componentVersionMap.get(name)?.add(version);
              }
            }
          }
        }
        
        // Convert the map to an array of component objects with versions
        const componentResults: Array<{name: string, version: string}> = [];
        
        componentVersionMap.forEach((versions, name) => {
          // Get the first non-empty version, or use a default
          const versionArray = Array.from(versions).filter(v => v && v.trim() !== "");
          const version = versionArray.length > 0 ? versionArray[0] : "latest";
          
          componentResults.push({
            name,
            version
          });
        });
        
        console.log(`Found ${componentResults.length} unique ${fieldName} values:`, componentResults);
        
        if (componentResults.length > 0) {
          return componentResults;
        }
      } catch (err) {
        console.warn(`Error getting components:`, err);
      }
      
      // Only use hardcoded fallback if nothing else works
      console.log("All approaches failed to find components, using hardcoded fallback");
      // Remove hardcoded fallbacks and simply return an empty array
      console.log(`No ${category} components found in the database. You may need to crawl and process documentation for this category.`);
      return [];
    } catch (error) {
      console.error(`Error getting available ${category} components:`, error);
      return [];
    } finally {
      // Additional cleanup
      if (this.client && typeof (this.client as any).close === 'function') {
        try {
          (this.client as any).close();
        } catch (e) {
          // Silently handle error as this is just cleanup
        }
      }
    }
  }

  /**
   * Get snippets count for a specific URL without loading content 
   */
  async getSnippetCountForUrl(url: string): Promise<number> {
    if (!this.collection) {
      console.error("Collection not initialized");
      throw new Error("Collection not initialized");
    }

    try {
      // Query only the IDs to minimize memory usage
      const queryResult = await this.collection.get({
        where: { source_url: url },
        include: [], // Don't load any content or metadata
      });
      
      return queryResult.ids.length;
    } catch (error) {
      console.error(`Error getting snippet count for URL ${url}:`, error);
      return 0;
    }
  }

  /**
   * Get all snippets for a specific URL
   */
  async getSnippetsForUrl(url: string, limit: number = 50): Promise<any[]> {
    if (!this.collection) {
      console.error("Collection not initialized");
      throw new Error("Collection not initialized");
    }

    try {
      console.log(`Retrieving snippets for URL: ${url} (limit: ${limit})`);
      
      // Create a URL-safe ID prefix for filtering
      // Clean URL for querying
      
      // Query documents by their metadata where source_url matches the URL
      // Apply limit for memory optimization
      const queryResult = await this.collection.get({
        where: { source_url: url },
        include: ["metadatas", "documents"],
        limit: limit
      });
      
      if (!queryResult.ids.length) {
        console.log(`No snippets found for URL: ${url}`);
        return [];
      }
      
      console.log(`Found ${queryResult.ids.length} snippets for URL: ${url}`);
      
      // Map the results to a more friendly format
      return queryResult.ids.map((id: string, index: number) => {
        const metadata = queryResult.metadatas[index] || {};
        
        return {
          id: id,
          title: metadata.title || "Untitled Snippet",
          description: metadata.description || "",
          content: queryResult.documents[index],
          category: metadata.category || "framework",
          language: metadata.language,
          language_version: metadata.language_version,
          framework: metadata.framework,
          framework_version: metadata.framework_version,
          library: metadata.library,
          library_version: metadata.library_version,
          source_url: metadata.source_url
        };
      });
    } catch (error) {
      console.error("Error retrieving snippets:", error);
      throw error;
    }
  }

  /**
   * Check if ChromaDB is loaded
   */
  isLoaded(): boolean {
    return this.dbLoaded;
  }
  
  /**
   * Dispose of resources to help memory management
   */
  dispose(): void {
    // Clear references to help garbage collection
    this.collection = null;
    
    if (this.client && typeof (this.client as any).close === 'function') {
      try {
        (this.client as any).close();
      } catch (e) {
        console.error("Error closing ChromaDB client:", e);
      }
    }
    
    this.client = null;
    this.dbLoaded = false;
  }

  /**
   * Debug method to inspect the collection contents
   */
  async debugInspectCollection(limit: number = 5): Promise<void> {
    try {
      if (!this.collection) {
        console.error("Collection not initialized, cannot inspect");
        return;
      }
      
      console.log(`Inspecting first ${limit} documents in collection...`);
      
      const results = await this.collection.get({
        limit,
        include: ["metadatas", "documents", "embeddings"]
      });
      
      console.log(`Found ${results.ids?.length || 0} documents.`);
      
      if (results.ids?.length) {
        console.log("Sample of document IDs:", results.ids.slice(0, Math.min(3, results.ids.length)));
        
        if (results.metadatas?.length) {
          console.log("First document metadata:");
          console.log(JSON.stringify(results.metadatas[0], null, 2));
          
          // Check for category field presence and value
          const categoryValues = new Set();
          for (const metadata of results.metadatas) {
            if (metadata && 'category' in metadata) {
              categoryValues.add(metadata.category);
            }
          }
          
          console.log("Unique category values found:", Array.from(categoryValues));
          
          // Check for specific metadata fields
          const fieldsPresence = {
            language: 0,
            framework: 0,
            library: 0
          };
          
          for (const metadata of results.metadatas) {
            if (metadata?.language) fieldsPresence.language++;
            if (metadata?.framework) fieldsPresence.framework++;
            if (metadata?.library) fieldsPresence.library++;
          }
          
          console.log("Field presence counts:", fieldsPresence);
        }
      }
    } catch (error) {
      console.error("Error inspecting collection:", error);
    }
  }

  /**
   * Get documents by filters without requiring a search query
   * This is used when you want to browse documents instead of searching
   */
  async getDocumentsByFilters(
    filters?: {
      category?: DocumentationCategory;
      language?: string;
      language_version?: string;
      framework?: string;
      framework_version?: string;
      library?: string;
      library_version?: string;
    },
    limit: number = 10,
    page: number = 1
  ): Promise<FullDocumentationSnippet[]> {
    try {
      console.log(`Getting documents with filters (page: ${page}, limit: ${limit}):`, filters);
      
      if (!this.collection) {
        throw new Error("ChromaDB collection not initialized");
      }

      // Prepare filter if specified
      let whereClause = undefined;
      if (filters) {
        const validFilters = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== "");
        
        if (validFilters.length > 0) {
          // ChromaDB requires specific format for where clause
          if (validFilters.length === 1) {
            const [key, value] = validFilters[0];
            whereClause = { [key]: value };
          } else {
            // Multiple filters need $and operator
            whereClause = {
              $and: validFilters.map(([key, value]) => ({ [key]: value }))
            };
          }
          console.log("Using where clause:", whereClause);
        }
      }

      // Calculate offset based on page
      const offset = (page - 1) * limit;

      // Query ChromaDB to get the documents
      let results;
      try {
        results = await this.collection.get({
          limit: Math.min(limit, 100), // Limit to 100 documents max
          offset: offset, // Apply pagination offset
          ...(whereClause ? { where: whereClause } : {})
        });
        
        console.log(`ChromaDB get returned: ${results?.ids?.length || 0} results (page: ${page}, offset: ${offset})`);
      } catch (err) {
        console.error("Error getting documents by filters:", err);
        throw err;
      }

      // Map results to FullDocumentationSnippet objects
      if (results && results.ids && results.ids.length > 0) {
        const snippets: FullDocumentationSnippet[] = [];
        
        for (let i = 0; i < results.ids.length; i++) {
          const id = results.ids[i];
          const metadata = results.metadatas[i];
          const content = results.documents[i];
          
          // Truncate content to avoid massive memory usage
          const truncatedContent = content.length > 10000 ? 
            content.substring(0, 10000) + "... [Content truncated to save memory]" : 
            content;
          
          snippets.push({
            snippet_id: id,
            category: metadata.category as DocumentationCategory,
            language: metadata.language,
            language_version: metadata.language_version,
            framework: metadata.framework,
            framework_version: metadata.framework_version,
            library: metadata.library,
            library_version: metadata.library_version,
            title: metadata.title,
            source_url: metadata.source_url,
            description: content.substring(0, 150) + "...", // Shorter description
            content: truncatedContent,
            concepts: metadata.concepts ? metadata.concepts.split(",") : []
          });
        }
        
        return snippets;
      }
      
      return [];
    } catch (error) {
      console.error("Error getting documents by filters:", error);
      return [];
    }
  }
}