// Import Tauri API v2
import { invoke } from "@tauri-apps/api/core";
import { ChromaClient } from "./chroma-client";
import { DocumentationCategory } from "./db";

export interface DocSnippet {
  id: string;
  title: string;
  content: string;
  source: string;
  category: "language" | "framework" | "library";
  name: string;
  version?: string;
}

export interface SearchResult {
  id: string;
  score: number;
  snippet: DocSnippet;
}

interface DocSearchParams {
  query?: string;
  category?: "language" | "framework" | "library";
  componentName?: string;
  componentVersion?: string;
  apiKey?: string;
  limit?: number;  // Number of documents to return
  page?: number;   // Page number for pagination
}

/**
 * Performs a vector search across all processed content
 */
export async function vectorSearch(query: string, apiKey?: string, limit?: number): Promise<SearchResult[]> {
  try {
    console.log(`Performing vector search for: "${query}"`);
    
    // If we have an API key, use the ChromaClient directly
    if (apiKey) {
      console.log("Using JS client for vector search with provided API key");
      const chromaClient = new ChromaClient(apiKey);
      await chromaClient.initialize();
      
      // Search using the client
      const results = await chromaClient.searchDocuments(query, {}, limit || 10);
      
      // Map results to SearchResult format
      const mappedResults = results.map(doc => ({
        id: String(doc.snippet_id || doc.id || ""),
        score: doc.score !== undefined ? doc.score : 0.8,
        snippet: {
          id: String(doc.snippet_id || doc.id || ""),
          title: doc.title || "Documentation",
          content: doc.content || "",
          source: doc.source_url || "",
          category: doc.category as "language" | "framework" | "library",
          name: doc.language || doc.framework || doc.library || "",
          version: doc.language_version || doc.framework_version || doc.library_version || ""
        }
      }));
      
      console.log(`JS vector search returned ${mappedResults.length} results`);
      return mappedResults;
    }
    
    // Fall back to Rust function (if API key is not provided)
    console.log("Falling back to Rust vector search implementation");
    
    // Call Rust function to perform vector search - don't filter by session
    const response = await invoke<any>("vector_search", {
      query,
      sessionId: null,
      limit: limit || 10
    });
    
    console.log("Vector search results:", response);
    
    // Log raw scores to help debug the negative scores issue
    if (response && Array.isArray(response) && response.length > 0) {
      console.log("Raw scores from vector search:", 
        response.map(r => ({ id: r.id, rawScore: r.score })));
    }
    
    // Check if the response has scores or we need to add them
    if (response && Array.isArray(response)) {
      // Log the structure of the first result to help debug
      if (response.length > 0) {
        console.log("First result structure:", JSON.stringify(response[0], null, 2));
        
        // Check if scores are present and in the right format
        const mappedResponse = response.map(result => {
          // Ensure the score is a number
          if (result.score === undefined || typeof result.score !== 'number') {
            console.log(`Adding default score to result (id: ${result.id})`);
            return {
              ...result,
              score: 0.9 // Default score if none exists
            };
          }
          
          // If we have negative scores, it suggests the similarity calculation
          // might not be a proper cosine similarity. Let's normalize to [0,1]
          if (result.score < 0) {
            console.log(`Normalizing negative score: ${result.score} for result (id: ${result.id})`);
            // Convert to a value between 0 and 1 (rescaling from [-1,1] to [0,1])
            // This preserves the relative ranking of results
            return {
              ...result,
              score: (result.score + 1) / 2
            };
          }
          
          // Keep the original score as-is if it's already between 0 and 1
          return result;
        });
        
        return mappedResponse;
      }
    }
    
    // If we got here, we'll just return the original response
    return response;
  } catch (error) {
    console.error("Vector search failed:", error);
    throw new Error(`Vector search failed: ${error}`);
  }
}

/**
 * Searches for documentation snippets based on the provided parameters
 */
export async function searchDocSnippets(params: DocSearchParams): Promise<SearchResult[]> {
  try {
    const { query, category, componentName, componentVersion, limit, page } = params;
    
    console.log("searchDocSnippets called with params:", {
      query,
      category,
      componentName,
      componentVersion,
      limit,
      page,
      hasApiKey: !!params.apiKey,
      apiKeyLength: params.apiKey ? params.apiKey.length : 0
    });
    
    // Pagination defaults
    const pageSize = limit || 20;
    const currentPage = page || 1;
    
    console.log(`Pagination: page ${currentPage}, pageSize ${pageSize}, offset ${(currentPage - 1) * pageSize}`);
    
    // Initialize ChromaDB client with API key from params (passed through from the UI)
    const apiKey = params.apiKey || "";
    
    if (!apiKey || apiKey.trim() === "") {
      console.error("No OpenAI API key provided for search");
      throw new Error("OpenAI API key is required to perform searches");
    }
    
    const chromaClient = new ChromaClient(apiKey);
    await chromaClient.initialize();
    
    // Use the ChromaClient's searchDocuments method directly
    if (query && query.trim() !== "") {
      // Create filter object
      const filters: any = {};
      
      // If a category is specified, add it to the filters
      if (category && category !== 'all') {
        filters.category = category; // Use the actual category instead of hardcoding to "framework"
      }
      
      // Component-specific filters
      if (category === "language" && componentName) {
        filters.language = componentName;
        if (componentVersion) filters.language_version = componentVersion;
      } else if (category === "framework" && componentName) {
        filters.framework = componentName;
        if (componentVersion) filters.framework_version = componentVersion;
      } else if (category === "library" && componentName) {
        // Use the correct field names for library
        filters.library = componentName;
        if (componentVersion) filters.library_version = componentVersion;
      }
      
      console.log("Searching ChromaDB with filters:", filters);
      
      let results;
      
      // For searches with a query, we have two options:
      // 1. Use searchDocuments for semantic search (but no pagination)
      // 2. Use getDocumentsByFilters for exact filtering with pagination
      
      // For better UX with large document sets, use getDocumentsByFilters with pagination
      results = await chromaClient.getDocumentsByFilters(filters, pageSize, currentPage);
      console.log(`ChromaDB document retrieval returned ${results.length} results (page: ${currentPage})`);
      
      // Map results to SearchResult format
      const mappedResults = results.map(doc => ({
        id: String(doc.snippet_id || doc.id || ""),
        score: doc.score !== undefined ? doc.score : 0.8, // Use the actual score if available
        snippet: {
          id: String(doc.snippet_id || doc.id || ""),
          title: doc.title || "Documentation",
          content: doc.content || "",
          source: doc.source_url || "",
          // Use the actual category from the document, but default to the user's selection
          category: (category || doc.category) as "language" | "framework" | "library",
          name: componentName || (doc.language || doc.framework || doc.library || ""),
          version: componentVersion || (doc.language_version || doc.framework_version || doc.library_version || "")
        }
      }));
      
      console.log(`Returning ${mappedResults.length} mapped results`);
      
      return mappedResults;
    } else if (componentName) {
      // No query provided but we have component filters - show all matching docs
      console.log("No query provided - getting all documents matching filters");
      
      // Create filter object
      const filters: any = {};
      
      // Set category filter
      if (category && category !== 'all') {
        filters.category = category; // Use the actual category rather than hardcoding to "framework"
      }
      
      // Component-specific filters
      if (category === "language" && componentName) {
        filters.language = componentName;
        if (componentVersion) filters.language_version = componentVersion;
      } else if (category === "framework" && componentName) {
        filters.framework = componentName;
        if (componentVersion) filters.framework_version = componentVersion;
      } else if (category === "library" && componentName) {
        // Use the correct field names for library
        filters.library = componentName;
        if (componentVersion) filters.library_version = componentVersion;
      }
      
      console.log("Getting documents with filters:", filters);
      
      // Get documents matching filters
      const results = await chromaClient.getDocumentsByFilters(filters, pageSize, currentPage);
      
      console.log(`ChromaDB returned ${results.length} documents matching filters (page: ${currentPage})`);
      
      // Map results to SearchResult format (use 1.0 score since they're exact matches)
      const mappedResults = results.map(doc => ({
        id: String(doc.snippet_id || doc.id || ""),
        score: 1.0, // Perfect score for browsing results
        snippet: {
          id: String(doc.snippet_id || doc.id || ""),
          title: doc.title || "Documentation",
          content: doc.content || "",
          source: doc.source_url || "",
          category: (category || doc.category) as "language" | "framework" | "library",
          name: componentName || (doc.language || doc.framework || doc.library || ""),
          version: componentVersion || (doc.language_version || doc.framework_version || doc.library_version || "")
        }
      }));
      
      console.log(`Returning ${mappedResults.length} browsing results`);
      
      return mappedResults;
    }
    
    return [];
  } catch (error) {
    console.error("Documentation snippet search failed:", error);
    throw new Error(`Documentation snippet search failed: ${error}`);
  }
}

/**
 * Lists all available components for a specific category
 */
export async function listDocComponents(category: "language" | "framework" | "library", apiKey?: string): Promise<Array<{name: string, version: string}>> {
  try {
    console.log(`Listing ${category} components`);
    
    // Use provided API key or get it from elsewhere
    const chromaApiKey = apiKey || "";
    if (!chromaApiKey) {
      console.warn("No API key provided for ChromaDB, returning empty list");
      return [];
    }
    
    // Initialize ChromaDB client with API key
    const chromaClient = new ChromaClient(chromaApiKey);
    await chromaClient.initialize();
    
    try {
      // Map our UI category to DB category
      let dbCategory: DocumentationCategory;
      if (category === "language") {
        dbCategory = DocumentationCategory.LANGUAGE;
      } else if (category === "framework") {
        dbCategory = DocumentationCategory.FRAMEWORK;
      } else if (category === "library") {
        dbCategory = DocumentationCategory.LIBRARY;
      } else {
        return [];
      }
      
      // Get components using the correct method
      const components = await chromaClient.getAvailableComponents(dbCategory);
      
      if (components.length === 0) {
        console.log(`No ${category} components found in the database. You may need to crawl and process documentation for this category.`);
      } else {
        console.log(`Found ${components.length} ${category} components in the database.`);
      }
      
      return components;
    } catch (chromaError) {
      console.error(`Error getting ${category} components from ChromaDB:`, chromaError);
      return [];
    }
  } catch (error) {
    console.error(`Failed to list ${category} components:`, error);
    throw new Error(`Failed to list ${category} components: ${error}`);
  }
}

// Helper function to get mock components
function getMockComponents(category: "language" | "framework" | "library"): Array<{name: string, version: string}> {
  // Return empty arrays instead of mock data
  return [];
}