import { z } from 'zod';

// Define the category enum to be shared between schema and types
export const DocumentCategory = {
  LANGUAGE: "language",
  FRAMEWORK: "framework",
  LIBRARY: "library"
} as const;

export type DocumentCategory = typeof DocumentCategory[keyof typeof DocumentCategory];

// Schema for validating document data
export const DocumentSchema = z.object({
  category: z.enum([DocumentCategory.LANGUAGE, DocumentCategory.FRAMEWORK, DocumentCategory.LIBRARY]),
  language: z.string().optional(),
  language_version: z.string().optional(),
  framework: z.string().optional(),
  framework_version: z.string().optional(),
  library: z.string().optional(),
  library_version: z.string().optional(),
  snippet_id: z.string(),
  source_url: z.string(),
  url_status: z.string().optional(),
  title: z.string(),
  description: z.string(),
  content: z.string(),
  concepts: z.array(z.string()).optional(),
  status: z.string().optional()
});

// Derive the type from the schema
export type DocumentMetadata = Omit<z.infer<typeof DocumentSchema>, 'snippet_id' | 'content'>;

export enum ContextType {
  LOCAL = 'local',
  SHARED = 'shared'
}

export interface UniversalDocument {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}

export interface DocumentFilter {
  category?: string;
  language?: string;
  framework?: string;
  library?: string;
  [key: string]: any;
}

export interface VectorDBInstance {
  /**
   * Initialize the vector DB instance with the given configuration
   */
  initialize(config: any): Promise<void>;
  
  /**
   * Add documents to the vector DB
   * Takes UniversalDocument and converts to provider-specific format internally
   */
  addDocuments(documents: UniversalDocument[]): Promise<void>;
  
  /**
   * Search for documents using a query string or embedding
   * Returns UniversalDocument format
   */
  searchDocuments(query: string | number[], filters?: DocumentFilter, limit?: number): Promise<UniversalDocument[]>;
  
  /**
   * Get documents by filters without a query
   * Returns UniversalDocument format
   */
  getDocumentsByFilters(filters?: DocumentFilter, limit?: number): Promise<UniversalDocument[]>;
  
  /**
   * Get the count of snippets for a specific URL
   */
  getSnippetCountForUrl(url: string): Promise<number>;
  
  /**
   * Update the status of a URL in the vector DB
   */
  updateURLStatus(url: string, status: string): Promise<void>;
  
  /**
   * Check if the vector DB is available
   */
  isAvailable(): boolean;
  
  /**
   * Get the context type (LOCAL or SHARED)
   */
  getContextType(): ContextType;
  
  /**
   * Update the OpenAI API key used for generating embeddings
   */
  updateApiKey?(apiKey: string): void;
}

export interface VectorDBProvider {
  /**
   * Create a new instance for the given session
   */
  createInstance(sessionId: number, openAIApiKey: string): Promise<VectorDBInstance>;
}

export interface VectorDBConfig {
  provider: string;
  config: Record<string, any>;
}

export interface ExtendedVectorDBSettings {
  pinecone_api_key: string;
  pinecone_index: string;
  openai_key?: string;
}

export class VectorDBError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'VectorDBError';
  }
} 