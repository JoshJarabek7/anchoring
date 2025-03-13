import { toast } from 'sonner';
import { DocumentationCategory, updateURLCleanedMarkdown, updateURLStatus } from './db';
import { convertToMarkdown } from './crawler';
import { processMarkdownWithAI } from './openai';
import { processMarkdownIntoSnippets } from './processor';
import { UniversalDocument } from './vector-db/types';

/**
 * Pipeline interfaces
 */
export interface DocumentSource {
  url: string;
  markdown: string;
  id?: number; // Add optional id field to allow database updates
}

export interface ProcessingOptions {
  cleanupModel: string;
  temperature: number;
  maxTokens: number;
  extractConcepts: boolean;
  maxConcurrency: number;
}

// Add new interface for vector DB operations
export interface VectorDBOperations {
  addDocuments: (documents: UniversalDocument[]) => Promise<void>;
  isInitialized: boolean;
}

export interface TechDetails {
  category: DocumentationCategory;
  language?: string;
  languageVersion?: string;
  framework?: string;
  frameworkVersion?: string;
  library?: string;
  libraryVersion?: string;
}

/**
 * Processing pipeline status
 */
export enum ProcessingStatus {
  IDLE = 'idle',
  CONVERTING = 'converting',
  CLEANING = 'cleaning',
  CHUNKING = 'chunking',
  EMBEDDING = 'embedding',
  COMPLETE = 'complete',
  ERROR = 'error'
}

/**
 * Full processing pipeline for a single document with non-blocking UI updates
 */
export async function processDocument(
  source: DocumentSource,
  techDetails: TechDetails,
  apiKey: string,
  vectorDBOps: VectorDBOperations,
  options: ProcessingOptions,
  onStatusChange: (status: ProcessingStatus, progress?: number) => void,
  urlId?: number
): Promise<UniversalDocument[]> {
  try {
    // We skip the HTML conversion step entirely - only work with markdown
    // Go directly to cleaning up the markdown with AI
    onStatusChange(ProcessingStatus.CLEANING);
    console.log("Starting AI cleanup of Markdown");
    
    try {
      // Use the AI processing directly - no need for additional timeout
      const cleanedMarkdown = await processMarkdownWithAI(source.markdown, apiKey, {
        model: options.cleanupModel,
        maxTokens: options.maxTokens,
        temperature: options.temperature
      });
      
      console.log("Finished AI cleanup of Markdown");
      
      // Store cleaned markdown in the database if we have a URL ID
      if (urlId) {
        console.log(`Updating cleaned markdown for URL ID ${urlId} in database`);
        await updateURLCleanedMarkdown(urlId, cleanedMarkdown);
        console.log(`Successfully saved cleaned markdown for URL ID ${urlId}`);
      } else {
        console.log("No URL ID provided, skipping database update for cleaned markdown");
      }
      
      // Step 3: Process into snippets with concepts
      onStatusChange(ProcessingStatus.CHUNKING);
      console.log("Processing Markdown into snippets");
      
      const snippets = await processMarkdownIntoSnippets(
        cleanedMarkdown,
        apiKey,
        source.url,
        techDetails.category,
        {
          language: techDetails.language,
          language_version: techDetails.languageVersion,
          framework: techDetails.framework,
          framework_version: techDetails.frameworkVersion,
          library: techDetails.library,
          library_version: techDetails.libraryVersion
        }
      );
      console.log(`Created ${snippets.length} snippets`);
      
      // Step 4: Store all snippets in VectorDB in a single batch operation
      onStatusChange(ProcessingStatus.EMBEDDING);
      console.log("Starting to store snippets in VectorDB");
      console.log(`Attempting to store ${snippets.length} snippets for URL: ${source.url}`);
      
      try {
        await vectorDBOps.addDocuments(snippets);
        console.log(`Successfully stored ${snippets.length} snippets in vector DB for ${source.url}`);
      } catch (storageError) {
        console.error(`Failed to store snippets in vector DB for ${source.url}:`, storageError);
        throw storageError;
      }
      
      onStatusChange(ProcessingStatus.COMPLETE);
      console.log("Document processing complete");
      return snippets;
    } catch (cleanupError) {
      console.error("Error during markdown cleanup:", cleanupError);
      toast.error(`Markdown cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      
      // Continue with the original markdown if cleanup fails
      console.log("Using original markdown as fallback after cleanup failure");
      
      // Step 3: Process into snippets with concepts (using original markdown)
      onStatusChange(ProcessingStatus.CHUNKING);
      console.log("Processing original Markdown into snippets");
      const snippets = await processMarkdownIntoSnippets(
        source.markdown,  // Use original markdown as fallback
        apiKey,
        source.url,
        techDetails.category,
        {
          language: techDetails.language,
          language_version: techDetails.languageVersion,
          framework: techDetails.framework,
          framework_version: techDetails.frameworkVersion,
          library: techDetails.library,
          library_version: techDetails.libraryVersion
        }
      );
      
      // Step 4: Store all snippets in VectorDB in a single batch operation
      onStatusChange(ProcessingStatus.EMBEDDING);
      console.log("Starting to store snippets in VectorDB");
      
      // Use the optimized batch method to store all snippets at once
      await vectorDBOps.addDocuments(snippets);
      
      // Report 100% progress when complete
      onStatusChange(ProcessingStatus.EMBEDDING, 100);
      console.log(`Processed ${snippets.length}/${snippets.length} snippets (100%)`);
      
      onStatusChange(ProcessingStatus.COMPLETE);
      console.log("Document processing complete");
      return snippets;
    }
  } catch (error) {
    console.error("Error processing document:", error);
    onStatusChange(ProcessingStatus.ERROR);
    throw error;
  }
}

/**
 * Process multiple documents in parallel with batched execution for optimized performance
 */
export async function processBatch(
  sources: DocumentSource[],
  techDetails: TechDetails,
  apiKey: string,
  vectorDBOps: VectorDBOperations,
  options: ProcessingOptions,
  onProgress: (url: string, status: ProcessingStatus, statusProgress?: number, overallProgress?: number) => void,
  onComplete: (results: { url: string; snippets: UniversalDocument[]; success: boolean }[]) => void
) {
  const results: { url: string; snippets: UniversalDocument[]; success: boolean }[] = [];
  let processedCount = 0;

  try {
    // Process sources in parallel with concurrency control
    const processingPromises = sources.map(async (source) => {
      try {
        onProgress(source.url, ProcessingStatus.CHUNKING);
        
        // Process markdown into snippets
        const snippets = await processMarkdownIntoSnippets(
          source.markdown,
          apiKey,
          source.url,
          techDetails.category,
          {
            language: techDetails.language,
            language_version: techDetails.languageVersion,
            framework: techDetails.framework,
            framework_version: techDetails.frameworkVersion,
            library: techDetails.library,
            library_version: techDetails.libraryVersion
          }
        );

        if (snippets.length === 0) {
          console.error(`No snippets generated for ${source.url}`);
          return { url: source.url, snippets: [], success: false };
        }

        // Store snippets in vector database
        onProgress(source.url, ProcessingStatus.EMBEDDING);
        await vectorDBOps.addDocuments(snippets);

        // Update progress
        processedCount++;
        onProgress(
          source.url,
          ProcessingStatus.COMPLETE,
          1,
          processedCount / sources.length
        );

        // Update URL status in database if ID is provided
        if (source.id) {
          await updateURLStatus(source.id, 'processed');
        }

        return { url: source.url, snippets, success: true };
      } catch (error) {
        console.error(`Error processing ${source.url}:`, error);
        onProgress(source.url, ProcessingStatus.ERROR);
        
        // Update URL status in database if ID is provided
        if (source.id) {
          await updateURLStatus(source.id, 'error');
        }
        
        return { url: source.url, snippets: [], success: false };
      }
    });

    // Wait for all processing to complete
    const processedResults = await Promise.all(processingPromises);
    results.push(...processedResults);

    // Call onComplete with results
    onComplete(results);
  } catch (error) {
    console.error("Error in processing batch:", error);
    toast.error("Failed to process documents");
    throw error;
  }
}
