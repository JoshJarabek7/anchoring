import { z } from 'zod';
import { chunkTextRecursively, initializeOpenAI } from './openai';
import { DocumentationCategory } from './db';
import { zodResponseFormat } from 'openai/helpers/zod';
import { UniversalDocument, DocumentCategory as VectorDBCategory } from './vector-db/types';

/**
 * Schema for a documentation snippet from structured output
 */
const DocumentSnippetSchema = z.object({
  title: z.string().describe("The title of the documentation snippet"),
  description: z.string().describe("A brief summary of what this snippet covers"),
  content: z.string().describe("The actual documentation content"),
  concepts: z.array(z.string()).describe("Key concepts covered in this snippet")
});

/**
 * Schema for the full processor output
 */
const ProcessorOutputSchema = z.object({
  snippets: z.array(DocumentSnippetSchema),
});

/**
 * Schema for concept extraction
 */
const ConceptsSchema = z.object({
  concepts: z.array(z.string()).describe("Key technical concepts extracted from the text")
});

export type DocumentSnippet = z.infer<typeof DocumentSnippetSchema>;
export type ProcessorOutput = z.infer<typeof ProcessorOutputSchema>;

/**
 * Process cleaned markdown into documentation snippets using GPT-4o-mini
 */
export async function processMarkdownIntoSnippets(
  markdown: string,
  apiKey: string,
  sourceUrl: string,
  category: DocumentationCategory,
  technicalInfo: {
    language?: string;
    language_version?: string;
    framework?: string;
    framework_version?: string;
    library?: string;
    library_version?: string;
  }
): Promise<UniversalDocument[]> {
  console.log("================================");
  console.log("PROCESSING MARKDOWN INTO SNIPPETS");
  console.log("================================");
  console.log(`Source URL: ${sourceUrl}`);
  console.log(`Category: ${category}`);
  console.log(`Technical info:`, technicalInfo);
  console.log(`Input markdown length: ${markdown.length} characters`);
  
  const startTime = performance.now();
  
  try {
    // Initialize OpenAI client
    console.log("Initializing OpenAI client");
    const openai = initializeOpenAI(apiKey);

    // First chunk the markdown to ensure it fits within token limits
    console.log("Chunking markdown for processing");
    if (!markdown || typeof markdown !== 'string') {
      console.error("Invalid markdown received:", markdown);
      throw new Error("Invalid markdown format: not a string");
    }
    
    const chunks = await chunkTextRecursively(markdown, 120000, "gpt-4o-mini", 500, "markdown");
    console.log(`Markdown split into ${chunks.length} chunks`);
    
    const allSnippets: UniversalDocument[] = [];
    
    // Process chunks in parallel with concurrency control
    const MAX_CONCURRENT = 3; // Process 3 chunks at a time
    
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
      const batchChunks = chunks.slice(i, i + MAX_CONCURRENT);
      const batchStartTime = performance.now();
      
      console.log(`Processing batch of ${batchChunks.length} chunks (${i+1}-${i+Math.min(i+MAX_CONCURRENT, chunks.length)}/${chunks.length})`);
      
      // Create an array of promises for processing each chunk
      const chunkPromises = batchChunks.map((chunk, batchIndex) => {
        const chunkIndex = i + batchIndex;
        const chunkHeader = `Part ${chunkIndex+1}/${chunks.length}: `;
        
        return (async () => {
          console.log(`Processing chunk ${chunkIndex+1}/${chunks.length} (${chunk.length} characters)`);
          const chunkStartTime = performance.now();
          
          try {
            // Use OpenAI SDK with Zod schema for structured output
            const completion = await openai.beta.chat.completions.parse({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are a technical documentation processor that extracts comprehensive, self-contained documentation snippets from markdown content. Your goal is to create meaningful, substantial snippets that each contain a complete explanation of a concept or feature. Follow these guidelines:\n\n1. Focus on educational content and actual documentation, not metadata or navigation elements\n2. Combine related small sections into larger, more useful snippets\n3. Remove irrelevant links, navigation references, and unnecessary formatting\n4. Make sure each snippet is substantial enough to be useful on its own\n5. Snippets should be at least several paragraphs long when possible\n6. Never include URLs, navigation breadcrumbs, or revision history"
                },
                {
                  role: "user",
                  content: `${chunkHeader}Process this documentation markdown into substantial, comprehensive snippets. Create larger, more complete sections rather than tiny fragments. Remove unnecessary links, URLs, and navigation elements.\n\nFor each snippet, provide:\n- A clear, descriptive title\n- A brief summary (1-2 sentences)\n- Comprehensive content (combine related sections)\n- Key technical concepts covered\n\nFocus on creating useful, educational content:\n\n${chunk}`
                }
              ],
              temperature: 0.2,
              response_format: zodResponseFormat(ProcessorOutputSchema, "processor_output"),
            });
            
            // Get the parsed snippets directly from the parsed response
            const validatedOutput = completion.choices[0].message.parsed;
            
            if (!validatedOutput || !validatedOutput.snippets) {
              console.error(`❌ Chunk ${chunkIndex+1}/${chunks.length}: Invalid or empty response from OpenAI`);
              return [];
            }
            
            console.log(`✅ Chunk ${chunkIndex+1}/${chunks.length}: Received ${validatedOutput.snippets.length} snippets from OpenAI`);
            
            // Convert directly to UniversalDocument format
            const snippets = validatedOutput.snippets.map((snippet, snippetIndex) => {
              // Create a unique ID for each snippet
              const id = `${sourceUrl.replace(/[^a-zA-Z0-9]/g, '_')}_${chunkIndex}_${snippetIndex}`;
              
              if (!snippet.title || !snippet.description || !snippet.content) {
                console.error(`❌ Snippet ${chunkIndex}_${snippetIndex} has missing required fields`);
                return null;
              }
              
              const universalDoc: UniversalDocument = {
                id,
                content: snippet.content,
                metadata: {
                  category: category.toLowerCase() as VectorDBCategory,
                  language: technicalInfo.language,
                  language_version: technicalInfo.language_version,
                  framework: technicalInfo.framework,
                  framework_version: technicalInfo.framework_version,
                  library: technicalInfo.library,
                  library_version: technicalInfo.library_version,
                  title: snippet.title,
                  description: snippet.description,
                  source_url: sourceUrl,
                  concepts: snippet.concepts || []
                }
              };
              
              return universalDoc;
            }).filter((snippet): snippet is UniversalDocument => snippet !== null);
            
            const chunkEndTime = performance.now();
            console.log(`✅ Processed chunk ${chunkIndex+1}/${chunks.length} in ${((chunkEndTime - chunkStartTime) / 1000).toFixed(2)}s`);
            
            return snippets;
          } catch (error) {
            console.error(`❌ Error processing chunk ${chunkIndex+1}/${chunks.length}:`, error);
            return [];
          }
        })();
      });
      
      // Wait for all promises in this batch to complete
      const batchResults = await Promise.all(chunkPromises);
      
      // Flatten and add all snippets from this batch
      const batchSnippets = batchResults.flat();
      allSnippets.push(...batchSnippets);
      
      const batchEndTime = performance.now();
      console.log(`✅ Processed batch ${Math.floor(i/MAX_CONCURRENT) + 1} in ${((batchEndTime - batchStartTime) / 1000).toFixed(2)}s, got ${batchSnippets.length} snippets`);
    }
    
    const endTime = performance.now();
    console.log(`✅ Processed all ${chunks.length} chunks in ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`Total snippets created: ${allSnippets.length}`);
    
    if (allSnippets.length === 0) {
      console.error("❌ No snippets were created");
      throw new Error("No snippets were created from the markdown content");
    }
    
    return allSnippets;
  } catch (error) {
    const endTime = performance.now();
    console.error(`❌ Error processing markdown into snippets in ${((endTime - startTime) / 1000).toFixed(2)}ms:`, error);
    throw error;
  }
}

/**
 * Extract key concepts from a given text
 */
export async function extractConcepts(
  text: string,
  apiKey: string
): Promise<string[]> {
  try {
    // Initialize OpenAI client
    const openai = initializeOpenAI(apiKey);

    // Use OpenAI SDK with Zod schema for structured output
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You extract key technical concepts from documentation text. Return only a list of strings, with each string being a concept mentioned in the text."
        },
        {
          role: "user",
          content: `Extract all the key technical concepts from this text:\n\n${text}`
        }
      ],
      temperature: 0.2,
      response_format: zodResponseFormat(ConceptsSchema, "concepts_extraction"),
    });

    // Get concepts directly from the parsed response
    if (!completion.choices[0]?.message?.parsed) {
      console.warn("Invalid or empty response from OpenAI");
      return [];
    }
    
    return completion.choices[0].message.parsed.concepts || [];
  } catch (error) {
    console.error("Error extracting concepts:", error);
    return [];
  }
}