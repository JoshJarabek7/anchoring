// Import Tauri API v2
import { invoke } from "@tauri-apps/api/core";
import { DocumentationCategory } from "./db";
import { createProviderWithKey } from "./vector-db";
import { ContextType } from "./vector-db/provider";
import { generateEmbedding } from "./openai";

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
    
    // If we have an API key, use the vector provider directly
    if (apiKey) {
      console.log("Using vector provider for search with provided API key");
      const provider = await createProviderWithKey(apiKey);
      
      // Generate embedding and search
      const embedding = await generateEmbedding(query, apiKey, 'text-embedding-3-large', 3072);
      const results = await provider.searchDocuments(embedding, {}, limit || 10);
      
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
      
      console.log(`Vector search returned ${mappedResults.length} results`);
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
    
    return response || [];
  } catch (error) {
    console.error("Error performing vector search:", error);
    return [];
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
    
    const apiKey = params.apiKey || "";
    if (!apiKey || apiKey.trim() === "") {
      console.error("No OpenAI API key provided for search");
      throw new Error("OpenAI API key is required to perform searches");
    }

    const provider = await createProviderWithKey(apiKey);
    
    // Create filter object
    const filters: any = {};
    
    // If a category is specified, add it to the filters
    if (category && category !== 'all') {
      filters.category = category;
    }
    
    // Component-specific filters
    if (category === "language" && componentName) {
      filters.language = componentName;
      if (componentVersion) filters.language_version = componentVersion;
    } else if (category === "framework" && componentName) {
      filters.framework = componentName;
      if (componentVersion) filters.framework_version = componentVersion;
    } else if (category === "library" && componentName) {
      filters.library = componentName;
      if (componentVersion) filters.library_version = componentVersion;
    }

    // Pagination defaults
    const pageSize = limit || 20;
    const currentPage = page || 1;
    
    let results;
    if (query && query.trim() !== "") {
      // For queries, use semantic search
      const embedding = await generateEmbedding(query, apiKey, 'text-embedding-3-large', 3072);
      results = await provider.searchDocuments(embedding, filters, pageSize);
    } else {
      // For browsing, use filter-based search
      results = await provider.getDocumentsByFilters(filters, pageSize, currentPage);
    }

    // Map results to SearchResult format
    const mappedResults = results.map(doc => ({
      id: String(doc.snippet_id || doc.id || ""),
      score: doc.score !== undefined ? doc.score : (query ? 0.8 : 1.0), // Higher score for browsing
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

    console.log(`Returning ${mappedResults.length} results`);
    return mappedResults;
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
    
    if (!apiKey) {
      console.warn("No API key provided, returning empty list");
      return [];
    }
    
    const provider = await createProviderWithKey(apiKey);
    
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
      
      // Get all documents for this category
      const results = await provider.getDocumentsByFilters({ category: dbCategory });
      
      // Extract unique component names and versions
      const componentMap = new Map<string, Set<string>>();
      
      for (const doc of results) {
        let name = '';
        let version = '';
        
        if (category === 'language') {
          name = doc.language || '';
          version = doc.language_version || '';
        } else if (category === 'framework') {
          name = doc.framework || '';
          version = doc.framework_version || '';
        } else if (category === 'library') {
          name = doc.library || '';
          version = doc.library_version || '';
        }
        
        if (name) {
          if (!componentMap.has(name)) {
            componentMap.set(name, new Set());
          }
          if (version) {
            componentMap.get(name)?.add(version);
          }
        }
      }
      
      // Convert to array format
      const components = Array.from(componentMap.entries()).map(([name, versions]) => ({
        name,
        version: Array.from(versions)[0] || '' // Just take the first version for now
      }));
      
      if (components.length === 0) {
        console.log(`No ${category} components found in the database.`);
      } else {
        console.log(`Found ${components.length} ${category} components.`);
      }
      
      return components;
    } catch (error) {
      console.error(`Error getting ${category} components:`, error);
      return [];
    }
  } catch (error) {
    console.error(`Failed to list ${category} components:`, error);
    throw new Error(`Failed to list ${category} components: ${error}`);
  }
}