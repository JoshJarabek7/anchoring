use async_openai::{
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessage,
        ChatCompletionRequestSystemMessageContent, ChatCompletionRequestUserMessage,
        ChatCompletionRequestUserMessageContent, CreateChatCompletionRequest,
        CreateChatCompletionResponse, CreateEmbeddingRequest, EmbeddingInput, ResponseFormat,
        ResponseFormatJsonSchema,
    },
    Client,
};
use serde_json::json;
use std::fmt;
use text_splitter::{ChunkConfig, TextSplitter};
use tiktoken_rs::{cl100k_base, o200k_base, CoreBPE};

/// Represents available embedding models
#[derive(Debug, Clone, PartialEq)]
pub enum EmbeddingModel {
    TextEmbedding3Large,
}

impl EmbeddingModel {
    pub fn as_str(&self) -> &str {
        match self {
            Self::TextEmbedding3Large => "text-embedding-3-large",
        }
    }
}

impl fmt::Display for EmbeddingModel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Represents available chat models
#[derive(Debug, Clone, PartialEq)]
pub enum ChatModel {
    Gpt4oMini,
}

impl ChatModel {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Gpt4oMini => "gpt-4o-mini",
        }
    }
}

impl fmt::Display for ChatModel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Unified model type for both embedding and chat operations
#[derive(Debug, Clone, PartialEq)]
pub enum ModelType {
    Embedding(EmbeddingModel),
    Chat(ChatModel),
}

impl ModelType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Embedding(model) => model.as_str(),
            Self::Chat(model) => model.as_str(),
        }
    }
}

/// Service for AI operations like text chunking, embeddings generation, and chat#[derive(Debug)]
// We need to implement Debug manually because CoreBPE doesn't implement Debug
pub struct IntelligenceService {
    /// Default model used for generating embeddings
    embedding_model: EmbeddingModel,
    /// Tokenizer for the embedding model
    embedding_tokenizer: CoreBPE,
    /// Default model used for chat completions
    chat_model: ChatModel,
    /// Tokenizer for the chat model
    chat_tokenizer: CoreBPE,
    /// Maximum input tokens allowed for chat operations
    max_chat_tokens: usize,
    /// Maximum input tokens allowed for embedding operations
    max_embedding_tokens: usize,
    /// Number of dimensions in the output embedding vectors
    embedding_dimension: usize,
}

impl Default for IntelligenceService {
    fn default() -> Self {
        Self::new()
    }
}

// Manual Debug implementation since CoreBPE doesn't implement Debug
impl std::fmt::Debug for IntelligenceService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("IntelligenceService")
            .field("embedding_model", &self.embedding_model)
            .field("chat_model", &self.chat_model)
            .field("max_chat_tokens", &self.max_chat_tokens)
            .field("max_embedding_tokens", &self.max_embedding_tokens)
            .field("embedding_dimension", &self.embedding_dimension)
            .finish_non_exhaustive()
    }
}

impl IntelligenceService {
    /// Creates a new instance with default configuration
    pub fn new() -> Self {
        Self {
            embedding_model: EmbeddingModel::TextEmbedding3Large,
            embedding_tokenizer: cl100k_base().expect("Failed to load cl100k tokenizer"),
            chat_model: ChatModel::Gpt4oMini,
            chat_tokenizer: o200k_base().expect("Failed to load o200k tokenizer"),
            max_chat_tokens: 124_000,
            max_embedding_tokens: 8_191,
            embedding_dimension: 2000,
        }
    }

    /// Splits content into chunks based on token limits
    ///
    /// # Arguments
    /// * `prefix` - Optional text to prepend to each chunk
    /// * `model_type` - Type of model determining tokenizer and token limits
    /// * `text` - Text content to be chunked
    pub fn chunk_text(
        &self,
        prefix: Option<String>,
        model_type: ModelType,
        text: String,
    ) -> Vec<String> {
        // Select appropriate tokenizer and token limit based on model type
        let (tokenizer, max_tokens) = match model_type {
            ModelType::Embedding(_) => (&self.embedding_tokenizer, self.max_embedding_tokens),
            ModelType::Chat(_) => (&self.chat_tokenizer, self.max_chat_tokens),
        };

        // Calculate tokens for prefix if provided
        let prefix_tokens = prefix
            .as_ref()
            .map(|text| tokenizer.split_by_token(text, true).unwrap().len())
            .unwrap_or(0);

        // Configure text splitter
        let chunk_config = ChunkConfig::new(max_tokens - prefix_tokens).with_sizer(tokenizer);
        let splitter = TextSplitter::new(chunk_config);

        // Split text and convert to String collection
        let mut chunks: Vec<String> = splitter.chunks(&text).map(String::from).collect();

        // Prepend text to each chunk if provided
        if let Some(prefix_text) = prefix {
            for chunk in &mut chunks {
                *chunk = format!("{}{}", prefix_text, chunk);
            }
        }

        chunks
    }

    /// Calculates the mean embedding vector from a collection of embeddings
    fn calculate_mean_embedding(&self, embeddings: &[Vec<f32>]) -> Vec<f32> {
        if embeddings.is_empty() {
            return Vec::new();
        }

        let dimension = self.embedding_dimension;
        let mut mean = vec![0.0; dimension];

        // Sum all embeddings
        for embedding in embeddings {
            for (i, &value) in embedding.iter().enumerate() {
                mean[i] += value;
            }
        }

        // Calculate average
        let count = embeddings.len() as f32;
        for value in &mut mean {
            *value /= count;
        }

        mean
    }

    /// Creates a single embedding for the given text
    async fn create_single_embedding(&self, text: &str) -> Vec<f32> {
        let client = Client::new();
        let request = CreateEmbeddingRequest {
            model: self.embedding_model.to_string(),
            dimensions: Some(self.embedding_dimension as u32),
            input: EmbeddingInput::String(text.to_string()),
            ..Default::default()
        };

        let response = client
            .embeddings()
            .create(request)
            .await
            .expect("Failed to create embedding");

        response.data[0].embedding.clone()
    }

    /// Creates embeddings for text, handling chunking and averaging
    ///
    /// # Arguments
    /// * `prefix` - Optional text to prepend to each chunk
    /// * `model_type` - Type of model to use
    /// * `text` - Text to create embeddings for
    pub async fn create_embedding(
        &self,
        prefix: Option<String>,
        model_type: ModelType,
        text: String,
    ) -> Vec<f32> {
        // Split content into chunks
        let chunks = self.chunk_text(prefix, model_type, text);

        // Create embeddings for each chunk
        let mut embeddings = Vec::with_capacity(chunks.len());
        for chunk in chunks {
            let embedding = self.create_single_embedding(&chunk).await;
            embeddings.push(embedding);
        }

        // Return mean embedding
        self.calculate_mean_embedding(&embeddings)
    }

    fn chat_messages(
        &self,
        system_content: &str,
        user_content: &str,
    ) -> Vec<ChatCompletionRequestMessage> {
        let system_message = ChatCompletionRequestSystemMessage {
            content: ChatCompletionRequestSystemMessageContent::Text(system_content.to_string()),
            name: None,
        };

        let user_message = ChatCompletionRequestUserMessage {
            content: ChatCompletionRequestUserMessageContent::Text(user_content.to_string()),
            name: None,
        };

        let system_message = ChatCompletionRequestMessage::System(system_message);
        let user_message = ChatCompletionRequestMessage::User(user_message);
        vec![system_message, user_message]
    }

    async fn chat_completion(
        &self,
        messages: Vec<ChatCompletionRequestMessage>,
        json_schema: Option<ResponseFormatJsonSchema>,
    ) -> Result<CreateChatCompletionResponse, String> {
        let client = Client::new();

        // Build base request
        let mut request = CreateChatCompletionRequest {
            messages,
            model: ChatModel::Gpt4oMini.to_string(),
            ..Default::default()
        };

        // Only set response_format if json_schema is Some
        if let Some(schema) = json_schema {
            request.response_format = Some(ResponseFormat::JsonSchema {
                json_schema: schema,
            });
        }

        // Send the request
        client
            .chat()
            .create(request)
            .await
            .map_err(|e| format!("OpenAI API error: {}", e))
    }

    pub async fn cleanup_markdown(&self, unclean_markdown: &str) -> Result<String, String> {
        let system_content = "You are an expert documentation assistant. Your task is to clean up and reformat Markdown documentation. Follow these rules:
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
            
            IMPORTANT: The text may be chunked into multiple parts for processing. The beginning of this chunk might continue from where a previous chunk ended. Do not remove content that might appear to start mid-sentence, mid-list, mid-table, or mid-section, as it likely connects to the previous chunk.
            
            Return only the cleaned Markdown with no explanations or other text.";

        // Rest of the implementation remains the same
        let chunks = self.chunk_text(
            None,
            ModelType::Chat(ChatModel::Gpt4oMini),
            unclean_markdown.to_string(),
        );
        let mut clean_markdown = String::new();

        for chunk in chunks {
            let messages = self.chat_messages(system_content, &chunk);

            match self.chat_completion(messages, None).await {
                Ok(response) => {
                    if let Some(choice) = response.choices.first() {
                        if let Some(content) = &choice.message.content {
                            clean_markdown.push_str(content);
                        }
                    }
                }
                Err(error_msg) => {
                    return Err(format!("Error cleaning markdown: {}", error_msg));
                }
            }
        }

        if clean_markdown.is_empty() {
            Err("No content was generated from the API".to_string())
        } else {
            Ok(clean_markdown)
        }
    }

    pub async fn generate_snippets(
        &self,
        clean_markdown: &str,
    ) -> Result<Vec<serde_json::Value>, String> {
        // Define the JSON schema for structured output
        let json_schema = json!({
            "type": "object",
            "properties": {
                "snippets": {
                    "type": "array",
                    "description": "Collection of comprehensive documentation snippets, each focusing on a specific topic or related group of concepts",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "A clear, descriptive title that precisely identifies the feature, method, or concept covered in this snippet. Should be specific enough to serve as a reference identifier."
                            },
                            "description": {
                                "type": "string",
                                "description": "A comprehensive yet concise summary (1-3 sentences) that explains what functionality this feature provides, what problem it solves, or why it's important. Should give readers immediate understanding of the snippet's purpose."
                            },
                            "content": {
                                "type": "string",
                                "description": "The complete, detailed explanation with all technical information preserved. Must include all parameters, return values, code examples, implementation details, edge cases, and usage instructions. This should be thorough and leave nothing out from the original documentation while improving clarity and organization."
                            },
                            "concepts": {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                },
                                "description": "A comprehensive list of technical terms, API names, methods, properties, and concepts that are directly relevant to this snippet. These serve as indexing terms for search and retrieval. Each concept should be specific and meaningful."
                            }
                        },
                        "required": ["title", "description", "content", "concepts"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["snippets"],
            "additionalProperties": false
        });

        let json_schema = ResponseFormatJsonSchema {
            description: Some("Documentation snippets extracted from markdown content".to_string()),
            name: "documentation_snippets".to_string(),
            schema: Some(json_schema),
            strict: Some(true),
        };

        // Combined comprehensive system prompt
        let system_content = "You are a technical documentation processor that extracts comprehensive, detailed documentation snippets from markdown content. Your task is to preserve ALL technical information while improving organization and clarity.
    
        IMPORTANT GUIDELINES:
        1. Create comprehensive, detailed snippets by dividing content into logical, self-contained sections
        2. COMBINE RELATED TOPICS into unified, thorough snippets rather than creating many tiny snippets
        3. Preserve ALL technical details, code examples, syntax information, and step-by-step instructions
        4. IMPROVE THE WORDING and organization to make instructions more understandable, but never remove information
        5. Each snippet should be COMPREHENSIVE and LONGER rather than shorter - err on the side of inclusion
        6. Include all parameters, return values, error handling, and edge cases
        7. Ensure code samples remain exactly as they appear in the original documentation
        8. Keep all formatting that enhances understanding (tables, lists, code blocks)
        9. REWRITE and CLARIFY confusing explanations while preserving their technical accuracy
        10. When possible, make the language more direct, clear, and instructive
        
        Your goal is to create standalone, comprehensive documentation pieces that are more clearly written and organized than the original, but contain ALL the same information and technical details. Make each snippet as thorough and detailed as possible.
        
        For EACH distinct section or topic in the documentation, create a separate snippet that includes:
        1. Title: Descriptive name of the specific feature, method, or concept covered
        2. Description: Brief summary of what this specific feature/method does or what the concept means
        3. Content: COMPLETE and DETAILED explanation with ALL:
           - Parameter descriptions
           - Return values
           - Code examples
           - Usage instructions 
           - Edge cases and warnings
           - Implementation details
        4. Concepts: Technical terms and concepts relevant to this snippet
        
        VERY IMPORTANT:
        - COMBINE related topics into comprehensive snippets (prefer fewer, more detailed snippets)
        - NEVER create tiny snippets with minimal content - they should be thorough
        - Preserve ALL technical details, examples, and code blocks
        - IMPROVE wording and clarity without removing information
        - INCLUDE all original information, just reorganized and better explained";

        // Split the markdown if needed and process in chunks
        let markdown_chunks = self.chunk_text(
            None,
            ModelType::Chat(ChatModel::Gpt4oMini),
            clean_markdown.to_string(),
        );

        let mut all_snippets = Vec::new();

        for (chunk_index, chunk) in markdown_chunks.iter().enumerate() {
            // Create a user message that includes chunk information if there are multiple chunks
            let chunk_info = if markdown_chunks.len() > 1 {
                format!("This is part {}/{} of the documentation. Process it into comprehensive snippets.",
                    chunk_index + 1, markdown_chunks.len())
            } else {
                "Process this technical documentation into comprehensive snippets.".to_string()
            };

            let user_content = format!(
                "{}
    
            Here is the markdown content to process into snippets:
    
            {}",
                chunk_info, chunk
            );

            let messages = self.chat_messages(system_content, &user_content);

            match self
                .chat_completion(messages, Some(json_schema.clone()))
                .await
            {
                Ok(response) => {
                    let content = match &response.choices[0].message.content {
                        Some(content) => content,
                        None => continue, // Skip empty responses
                    };

                    match serde_json::from_str::<serde_json::Value>(content) {
                        Ok(json_response) => {
                            if let Some(snippets_array) =
                                json_response.get("snippets").and_then(|v| v.as_array())
                            {
                                // Add all snippets from this chunk to our collection
                                for snippet in snippets_array {
                                    all_snippets.push(snippet.clone());
                                }
                            }
                        }
                        Err(e) => {
                            // Log the error but continue with other chunks
                            eprintln!("Failed to parse JSON from chunk {}: {}", chunk_index + 1, e);
                            eprintln!("Raw content: {}", content);
                        }
                    }
                }
                Err(error_msg) => {
                    // Log error but continue with other chunks
                    eprintln!(
                        "Error generating snippets for chunk {}: {}",
                        chunk_index + 1,
                        error_msg
                    );
                }
            }
        }

        if all_snippets.is_empty() {
            Err("Failed to generate any valid snippets".to_string())
        } else {
            Ok(all_snippets)
        }
    }
}
