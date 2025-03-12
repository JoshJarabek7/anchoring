import { toast } from 'sonner';
import { FullDocumentationSnippet, DocumentationCategory, updateURLCleanedMarkdown, updateURLStatus } from './db';
import { convertToMarkdown } from './crawler';
import { processMarkdownWithAI } from './openai';
import { processMarkdownIntoSnippets } from './processor';

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
  maxConcurrency?: number; // Optional parameter for controlling max parallel processing
}

// Add new interface for vector DB operations
export interface VectorDBOperations {
  addDocuments: (documents: any[]) => Promise<void>;
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
): Promise<FullDocumentationSnippet[]> {
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
  onStatusChange: (url: string, status: ProcessingStatus, progress?: number, overallProgress?: number) => void,
  onComplete: (results: { url: string, snippets: FullDocumentationSnippet[], success: boolean, error?: string }[]) => void
): Promise<void> {
  if (!vectorDBOps.isInitialized) {
    throw new Error("Vector database is not available");
  }

  // Initialize results array with correct size to maintain order
  const results: ({ url: string, snippets: FullDocumentationSnippet[], success: boolean, error?: string } | undefined)[] = Array(sources.length).fill(undefined);
  
  // Track overall progress
  let completedCount = 0;
  const totalCount = sources.length;
  const updateOverallProgress = () => {
    const overallProgress = completedCount / totalCount;
    // Update all listeners with new overall progress
    console.log(`Overall progress: ${Math.round(overallProgress * 100)}% (${completedCount}/${totalCount})`);
    return overallProgress;
  };
  
  // Process documents in parallel with concurrency control
  const processBatchInParallel = async () => {
    // Use user-specified concurrency or default to 2 (reduced to avoid DB connection pool exhaustion)
    const MAX_CONCURRENT = options.maxConcurrency || 2;
    console.log(`Using max concurrency: ${MAX_CONCURRENT}`);
    
    // Track processing URLs to persist state between batches
    const processedUrls = new Set<string>();
    
    for (let i = 0; i < sources.length; i += MAX_CONCURRENT) {
      const batch = sources.slice(i, i + MAX_CONCURRENT);
      console.log(`Processing batch ${i/MAX_CONCURRENT + 1}: ${batch.length} URLs (${i+1}-${Math.min(i+batch.length, sources.length)} of ${sources.length})`);
      
      const batchPromises = batch.map(async (source, batchIdx) => {
        const sourceIndex = i + batchIdx;
        
        // Skip if already processed (can happen if the user restarted processing)
        if (processedUrls.has(source.url)) {
          console.log(`Skipping ${source.url} as it was already processed`);
          return { url: source.url, snippets: [], success: true, index: sourceIndex };
        }
        
        // Notify status change at the beginning with overall progress
        const initialOverallProgress = updateOverallProgress();
        onStatusChange(source.url, ProcessingStatus.CONVERTING, 0, initialOverallProgress);
        
        try {
          // Each document has its own progress through several phases
          // Phase weights as percentages of document processing
          const PHASE_WEIGHTS: Record<ProcessingStatus, number> = {
            [ProcessingStatus.CONVERTING]: 0.1,  // 10% for HTML conversion
            [ProcessingStatus.CLEANING]: 0.3,    // 30% for AI cleaning 
            [ProcessingStatus.CHUNKING]: 0.2,    // 20% for chunking
            [ProcessingStatus.EMBEDDING]: 0.4,   // 40% for embedding
            [ProcessingStatus.IDLE]: 0,
            [ProcessingStatus.COMPLETE]: 1.0,
            [ProcessingStatus.ERROR]: 0
          };
          
          let currentPhase = ProcessingStatus.IDLE;
          
          // Calculate weighted progress across all phases
          const calculateDocumentProgress = (status: ProcessingStatus, phaseProgress = 1.0) => {
            // Calculate progress up to previous phases
            let progress = 0;
            for (const phase of [ProcessingStatus.CONVERTING, ProcessingStatus.CLEANING, 
                               ProcessingStatus.CHUNKING, ProcessingStatus.EMBEDDING]) {
              // Add completed prior phases
              if (phase === status) {
                // For current phase, multiply by phase progress
                progress += PHASE_WEIGHTS[phase] * phaseProgress;
                break;
              } else {
                // Add 100% of previous phases
                progress += PHASE_WEIGHTS[phase];
              }
            }
            
            return Math.min(progress, 1.0); // Cap at 100%
          };
          
          // Create a wrapper for the status change callback to match signatures
          const statusChangeWrapper = (status: ProcessingStatus, phaseProgress?: number) => {
            // Track current phase
            currentPhase = status;
            
            // Calculate document-level progress
            const documentProgress = calculateDocumentProgress(status, phaseProgress);
            
            // Update overall progress
            const overallProgress = updateOverallProgress();
            
            // Update the status for UI
            onStatusChange(source.url, status, documentProgress, overallProgress);
          };
          
          const snippets = await processDocument(
            source,
            techDetails,
            apiKey,
            vectorDBOps,
            options,
            statusChangeWrapper,
            source.id
          );
          
          // Mark this URL as processed
          processedUrls.add(source.url);
          
          // Update database to mark URL as processed immediately upon completion
          if (source.id) {
            try {
              await updateURLStatus(source.id, "processed");
              console.log(`✅ Marked URL ${source.url} as processed in database`);
            } catch (dbError) {
              console.error(`Failed to update URL status in database for ${source.url}:`, dbError);
            }
          } else {
            console.log(`No ID available for URL ${source.url}, skipping database status update`);
          }
          
          return { url: source.url, snippets, success: true, error: undefined, index: sourceIndex };
        } catch (error) {
          console.error(`Error processing document ${source.url}:`, error);
          return { url: source.url, snippets: [], success: false, error: error instanceof Error ? error.message : String(error), index: sourceIndex };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result) => {
        if (result.success) {
          results[result.index] = {
            url: result.url,
            snippets: result.snippets,
            success: result.success,
            error: result.error
          };
        } else {
          console.error(`Error processing document ${result.url}:`, result.error);
        }
      });
      
      // Update overall progress
      completedCount += batch.length;
      updateOverallProgress();
    }
  };
  
  await processBatchInParallel();
  
  // Filter out undefined results
  const filteredResults = results
    .filter((result): result is { url: string, snippets: FullDocumentationSnippet[], success: boolean, error?: string } => 
      result !== undefined
    );
  
  // Call onComplete with filtered results
  onComplete(filteredResults);
}
