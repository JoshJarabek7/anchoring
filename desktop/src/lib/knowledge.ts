// Import Tauri API v2
import { invoke } from "@tauri-apps/api";

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
}

/**
 * Performs a vector search across all processed content
 */
export async function vectorSearch(query: string, limit?: number): Promise<SearchResult[]> {
  try {
    console.log(`Performing vector search for: "${query}"`);
    
    // Call Rust function to perform vector search - don't filter by session
    const response = await invoke<any>("vector_search", {
      query,
      sessionId: null,
      limit: limit || 10
    });
    
    console.log("Vector search results:", response);
    
    // The Rust function already returns data in the expected format
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
    const { query, category, componentName, componentVersion } = params;
    
    // Use the MCP documentation snippets tool
    // This is connected to our plugin
    const response = await invoke('plugin:mcp__doc-snippets|query_documentation_snippets', {
      request: {
        query: query || "",
        category: category || "library", // Default to library if not specified
        languages: null,
        frameworks: category === "framework" ? [{ name: componentName, version: componentVersion }] : null,
        libraries: category === "library" ? [{ name: componentName, version: componentVersion }] : null,
        n_results: 10,
        code_context: []
      }
    });
    
    // Convert the response to our SearchResult format
    return formatDocResults(response);
  } catch (error) {
    console.error("Documentation snippet search failed:", error);
    throw new Error(`Documentation snippet search failed: ${error}`);
  }
}

/**
 * Lists all available components for a specific category
 */
export async function listDocComponents(category: "language" | "framework" | "library"): Promise<Array<{name: string, version?: string}>> {
  try {
    // Use the MCP documentation components list tool
    const response = await invoke('plugin:mcp__doc-snippets|list_documentation_components', {
      category
    });
    
    // Format the response
    return formatComponentsList(response);
  } catch (error) {
    console.error(`Failed to list ${category} components:`, error);
    throw new Error(`Failed to list ${category} components: ${error}`);
  }
}

// Helper function to format the components list response
function formatComponentsList(response: any): Array<{name: string, version?: string}> {
  if (!response || !Array.isArray(response)) {
    return [];
  }
  
  return response.map((component: any) => ({
    name: component.name,
    version: component.version || undefined
  }));
}

// Helper function to format documentation search results
function formatDocResults(response: any): SearchResult[] {
  if (!response || !Array.isArray(response)) {
    return [];
  }
  
  return response.map((result: any, index: number) => ({
    id: result.id || `doc-result-${index}`,
    score: result.score || 0.5,
    snippet: {
      id: result.id || `snippet-${index}`,
      title: result.title || "Documentation Snippet",
      content: result.content || "",
      source: result.source || "Unknown source",
      category: result.category || "library",
      name: result.component_name || "Unknown",
      version: result.component_version
    }
  }));
}

// The mock function has been replaced by the actual Rust implementation