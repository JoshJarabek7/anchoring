import { encodingForModel } from "js-tiktoken";
import OpenAI from "openai";
import { toast } from "sonner";

/**
 * Initialize OpenAI client with API key
 */
export const initializeOpenAI = (apiKey: string): OpenAI => {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // Required for frontend usage
  });
};

/**
 * Count tokens in text using Rust implementation
 */
export const countTokens = async (text: string, model: "gpt-4o-mini" | "text-embedding-3-large" = "gpt-4o-mini"): Promise<number> => {
  try {
    // Use the Rust implementation via Tauri command
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Map model names to tokenizer types
    const tokenizerType = model === "gpt-4o-mini" ? "o200k_base" : "cl100k_base";
    
    const count = await invoke('count_tokens', { text, modelType: tokenizerType }) as number;
    return count;
  } catch (error) {
    // Fallback to simple approximation if Rust implementation fails
    console.warn("Rust token counting failed, using fallback:", error);
    return Math.ceil(text.length / 4);
  }
};

/**
 * Token count cache to avoid repeated token counting operations
 */
const tokenCountCache = new Map<string, number>();

/**
 * Count tokens with caching to avoid repeated token counting operations
 */
export const cachedCountTokens = async (text: string, model: "gpt-4o-mini" | "text-embedding-3-large" = "gpt-4o-mini"): Promise<number> => {
  // For very short strings, don't bother with cache
  if (text.length < 50) return await countTokens(text, model);
  
  // Generate cache key
  const cacheKey = `${text.substring(0, 100)}:${text.length}:${model}`;
  
  if (tokenCountCache.has(cacheKey)) {
    return tokenCountCache.get(cacheKey)!;
  }
  
  const count = await countTokens(text, model);
  tokenCountCache.set(cacheKey, count);
  
  // Keep cache size manageable
  if (tokenCountCache.size > 1000) {
    // Delete oldest entries (first 200)
    const keysToDelete = Array.from(tokenCountCache.keys()).slice(0, 200);
    keysToDelete.forEach(key => tokenCountCache.delete(key));
  }
  
  return count;
};

/**
 * Advanced text chunking function using Rust backend for optimal performance
 * 
 * Default values:
 * - For AI text completion (chat): Use ~128k tokens to leverage the full gpt-4o-mini context window
 * - For embeddings: Use ~8k tokens which is the optimal chunking size for embedding models
 * 
 * The function automatically detects content type (text, markdown, code) and uses the appropriate splitter
 */
export const chunkTextByTokens = async (
  text: string,
  maxTokens: number = 0, // 0 means use model-specific defaults (8k for embeddings, 128k for gpt-4o)
  model: "gpt-4o-mini" | "text-embedding-3-large" = "gpt-4o-mini",
  chunkOverlap: number = 200,
  contentType?: "text" | "markdown" | "code" // Optional content type hint
): Promise<string[]> => {
  try {
    console.log(`Splitting text using Rust implementation (model: ${model}, maxTokens: ${maxTokens || "default"})`);
    
    // Use the Rust implementation via Tauri command
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Map model names to tokenizer types
    const tokenizerType = model === "gpt-4o-mini" ? "o200k_base" : "cl100k_base";
    
    // Call Rust function with enhanced parameters
    const chunks = await invoke('split_text_by_tokens', { 
      text, 
      modelType: tokenizerType,
      chunkSize: maxTokens, // 0 will use model default (8k or 128k)
      chunkOverlap,
      contentType // Pass optional content type hint
    }) as string[];
    
    console.log(`✅ Split text into ${chunks.length} chunks using Rust implementation`);
    return chunks;
  } catch (error) {
    console.warn("Rust text splitting failed, falling back to JS implementation:", error);
    return fallbackChunkText(text, maxTokens || (model === "gpt-4o-mini" ? 128000 : 8000));
  }
};

/**
 * Legacy text chunking implementation for fallback
 * Only used if the Rust implementation fails
 */
export const fallbackChunkText = (
  text: string,
  maxTokens: number = 120000, // Default optimized for GPT-4o-mini's context window  
): string[] => {
  // Simple fallback implementation - split by paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  
  const chunks: string[] = [];
  let currentChunk = "";
  let estimatedTokens = 0;
  
  for (const paragraph of paragraphs) {
    // Skip empty paragraphs
    if (!paragraph.trim()) continue;
    
    // Estimate tokens (simple 1:4 character ratio)
    const estimatedParagraphTokens = Math.ceil(paragraph.length / 4);
    
    if (estimatedTokens + estimatedParagraphTokens <= maxTokens) {
      // Paragraph fits in current chunk
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      estimatedTokens += estimatedParagraphTokens;
    } else {
      // Paragraph doesn't fit, start a new chunk
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      
      // If paragraph itself is too large, just add it as its own chunk
      currentChunk = paragraph;
      estimatedTokens = estimatedParagraphTokens;
    }
  }
  
  // Add the last chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
};

// For backwards compatibility
export const chunkTextRecursively = chunkTextByTokens;

/**
 * Process markdown with GPT-4o-mini for cleanup
 */
export const processMarkdownWithAI = async (
  markdown: string,
  apiKey: string,
  params?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> => {
  if (!markdown || markdown.trim() === "") {
    return "";
  }

  // Apply default parameters if not provided
  const model = params?.model || "gpt-4o-mini";
  const maxTokens = params?.maxTokens || 120000; // Default optimized for GPT-4o-mini
  const temperature = params?.temperature !== undefined ? params?.temperature : 0.2;

  // Declare the chunks variable at the top level so it's accessible in both try and catch blocks
  let chunks: string[] = [];

  try {
    console.log("Initializing OpenAI client for markdown processing");
    // Create a new OpenAI client for this processing operation
    const openai = initializeOpenAI(apiKey);
    
    // Count tokens to see if we need to chunk
    const tokenCount = await cachedCountTokens(markdown, "gpt-4o-mini");
    console.log(`Markdown is approximately ${tokenCount} tokens`);
    
    if (tokenCount <= maxTokens) {
      // If we're within token limits, just process the whole thing
      console.log("Processing entire markdown with OpenAI (no chunking needed)");
      
      const startTime = performance.now();
      
      // Add progress notification
      const processingToast = toast.loading("Processing markdown with AI...", {
        id: "markdown-processing",
        duration: Infinity, // Don't auto-dismiss
      });
      
      try {
        // Use the OpenAI API directly
        const completion = await openai.beta.chat.completions.parse({
          model: model,
          messages: [
            {
              role: "system",
              content: `You are an expert documentation assistant. Your task is to clean up and reformat Markdown documentation. Follow these rules:
              1. Fix formatting issues like broken tables, code blocks, or mismatched Markdown syntax
              2. Remove any headers that seem to be navigation or UI elements (sidebars, top bars, etc.)
              3. Fix any text that appears to be cut off or truncated
              4. Preserve all code examples and technical details exactly
              5. Keep all URLs intact
              6. Maintain the original structure and hierarchy of the document
              7. Do not modify the actual technical content or explanations
              8. Do not add commentary or your own insights
              9. Do not remove any technical content
              10. Do not omit any sections
              
              Return only the cleaned Markdown with no explanations or other text.`
            },
            {
              role: "user",
              content: markdown
            }
          ],
          temperature: temperature,
        });
        
        // Access the content from the response
        const result = completion.choices?.[0]?.message?.content || "";
        
        // Success - dismiss the toast
        toast.dismiss("markdown-processing");
        
        const endTime = performance.now();
        console.log(`✅ OpenAI processing completed in ${((endTime - startTime) / 1000).toFixed(2)}s`);
        
        return result;
      } catch (error) {
        // Dismiss the toast in case of error
        toast.dismiss("markdown-processing");
        console.error("❌ Error processing markdown with OpenAI:", error);
        throw error;
      }
    }
    
    // We need to chunk the markdown
    console.log("Markdown exceeds token limit, chunking...");
    // Use nearly the full context window - GPT-4o-mini has 128k input tokens separate from output tokens
    chunks = await chunkTextByTokens(markdown, 127000, "gpt-4o-mini", 0, "markdown");
    console.log(`Markdown split into ${chunks.length} chunks`);
    
    // Process chunks in parallel with a concurrency limit
    const MAX_CONCURRENT = 3; // Process 3 chunks at a time
    let cleanedChunks: string[] = new Array(chunks.length);
    
    console.log(`Processing chunks with OpenAI (max ${MAX_CONCURRENT} concurrent requests):`);
    
    // Process chunks with limited concurrency
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
      const currentBatch = chunks.slice(i, i + MAX_CONCURRENT);
      const batchStartIndices = Array.from({length: currentBatch.length}, (_, idx) => i + idx);
      
      const batchStartTime = performance.now();
      console.log(`Processing batch of ${currentBatch.length} chunks (${i+1}-${i+currentBatch.length}/${chunks.length})`);
      
      // Create an array of promises for this batch
      const batchPromises = currentBatch.map((chunk, batchIndex) => {
        const chunkIndex = i + batchIndex + 1;
        const toastId = `chunk-${chunkIndex}`;
        
        // Create a toast for each chunk in the batch
        toast.loading(`Processing chunk ${chunkIndex}/${chunks.length}...`, {
          id: toastId,
          duration: 60000, // Auto-dismiss after 60 seconds as a fallback
        });
        
        return (async () => {
          try {
            const chunkStartTime = performance.now();
            
            // Use the OpenAI API
            const completionResult = await openai.beta.chat.completions.parse({
              model: model,
              messages: [
                {
                  role: "system",
                  content: `You are an expert documentation assistant. Your task is to clean up and reformat a PORTION of Markdown documentation. Follow these rules:
                  1. Fix formatting issues like broken tables, code blocks, or mismatched Markdown syntax
                  2. Remove any headers that seem to be navigation or UI elements (sidebars, top bars, etc.)
                  3. Fix any text that appears to be cut off or truncated
                  4. Preserve all code examples and technical details exactly
                  5. Keep all URLs intact
                  6. Maintain the original structure and hierarchy of the document portion
                  7. Do not modify the actual technical content or explanations
                  8. Do not add commentary or your own insights
                  9. Do not remove any technical content
                  10. Do not omit any sections
                  11. This is part of a larger document, so avoid adding conclusions or summaries
                  
                  Return only the cleaned Markdown portion with no explanations or other text.`
                },
                {
                  role: "user",
                  content: chunk
                }
              ],
              temperature: temperature,
            });
            
            // Get the result
            const cleanedChunk = completionResult.choices?.[0]?.message?.content || "";
            
            // Update toast and log results
            toast.dismiss(toastId);
            
            if (!cleanedChunk) {
              console.error(`Error processing chunk ${chunkIndex}/${chunks.length}: No content returned`);
              toast.error(`Error processing chunk ${chunkIndex}/${chunks.length}: No content returned`, {
                duration: 3000,
              });
              return { index: batchStartIndices[batchIndex], content: chunk }; // Return original as fallback
            } else {
              const chunkEndTime = performance.now();
              console.log(`✅ Chunk ${chunkIndex}/${chunks.length} processed in ${((chunkEndTime - chunkStartTime) / 1000).toFixed(2)}s`);
              return { index: batchStartIndices[batchIndex], content: cleanedChunk };
            }
          } catch (chunkError) {
            // Handle error
            toast.dismiss(toastId);
            console.error(`❌ Error processing chunk ${chunkIndex}/${chunks.length}:`, chunkError);
            return { index: batchStartIndices[batchIndex], content: chunk }; // Return original as fallback
          }
        })();
      });
      
      // Wait for all promises in the current batch to resolve
      const batchResults = await Promise.all(batchPromises);
      
      // Store results in the correct order
      batchResults.forEach(result => {
        cleanedChunks[result.index] = result.content;
      });
      
      const batchEndTime = performance.now();
      console.log(`✅ Batch ${i/MAX_CONCURRENT + 1} processed in ${((batchEndTime - batchStartTime) / 1000).toFixed(2)}s`);
    }
    
    // Join the chunks back together
    const result = cleanedChunks.join("\n\n");
    
    return result;
  } catch (error) {
    console.error("❌ Fatal error in processMarkdownWithAI:", error);
    
    // Dismiss any lingering toasts
    toast.dismiss("markdown-processing");
    
    // Just in case - try to dismiss any lingering chunk toasts
    for (let i = 1; i <= Math.min(100, chunks?.length || 20); i++) {
      toast.dismiss(`chunk-${i}`);
    }
    
    throw error;
  }
};

/**
 * Generate embeddings for text using OpenAI API
 */
export const generateEmbedding = async (
  text: string,
  apiKey: string,
  model: string = "text-embedding-3-large",
  dimensions: number = 3072 // Default to 3072 dimensions to match MCP server
): Promise<number[]> => {
  try {
    const openai = initializeOpenAI(apiKey);
    
    const response = await openai.embeddings.create({
      model: model,
      input: text,
      dimensions: dimensions, // Use 3072 dimensions by default
      encoding_format: "float"
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
};

/**
 * Process a document for embedding by generating an embedding for the text
 * Note: This uses different chunking settings from text completion - 8k is optimal for embeddings
 */
export const processDocumentForEmbedding = async (
  document: string,
  apiKey: string,
  maxTokens: number = 8000, // Optimal for embedding models
  dimensions: number = 3072 // Default to 3072 dimensions to match MCP server
): Promise<number[]> => {
  // Chunk text using our Rust implementation with optimal settings for embeddings
  // Let the function use default size (8191) for embedding model with no overlap (we rely on semantic chunking)
  const chunks = await chunkTextByTokens(document, 0, "text-embedding-3-large", 0);
  
  // Get embeddings for each chunk
  const chunkEmbeddings: number[][] = [];
  
  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk, apiKey, "text-embedding-3-large", dimensions);
    chunkEmbeddings.push(embedding);
  }
  
  // If only one chunk, return its embedding
  if (chunkEmbeddings.length === 1) {
    return chunkEmbeddings[0];
  }
  
  // Otherwise compute mean embedding
  const dimensions_count = chunkEmbeddings[0].length;
  const meanEmbedding = new Array(dimensions_count).fill(0);
  
  for (const embedding of chunkEmbeddings) {
    for (let i = 0; i < dimensions_count; i++) {
      meanEmbedding[i] += embedding[i] / chunkEmbeddings.length;
    }
  }
  
  // Normalize the mean embedding to unit length
  const norm = Math.sqrt(meanEmbedding.reduce((sum, val) => sum + val * val, 0));
  const normalizedEmbedding = meanEmbedding.map(val => val / norm);
  
  return normalizedEmbedding;
};