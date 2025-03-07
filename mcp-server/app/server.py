# server.py
from mcp.server.fastmcp import FastMCP
import chromadb
from chromadb.config import Settings
from pydantic import BaseModel, Field
from enum import Enum
from openai import OpenAI
from chromadb import Documents, EmbeddingFunction, Embeddings
import tiktoken
import re
import numpy as np
from dotenv import load_dotenv
import os
import sys
import traceback
import asyncio
from typing import AsyncIterator
load_dotenv()

# Add a helper for debug logging
def debug_log(message):
    print(f"DEBUG: {message}", file=sys.stderr)

# Override with localhost to ensure we can connect from outside Docker
openai_api_key = os.getenv("OPENAI_API_KEY")
debug_log(f"OPENAI_API_KEY is {'set' if openai_api_key else 'NOT SET'}")

# Initialize global resources
chroma_client = None
collection = None

# Create an MCP server without the lifespan
mcp = FastMCP("Version-Pinned Documentation Snippets", 
              dependencies=["openai", "pydantic", "chromadb", "tiktoken", "numpy"])

encoder = tiktoken.encoding_name_for_model("text-embedding-3-large")

def count_tokens(string: str):
    return len(encoder.encode(string))


class MyEmbeddingFunction(EmbeddingFunction):
    def __call__(self, input: Documents) -> Embeddings:
        """
        Processes a list of documents, recursively chunks them, computes embeddings,
        and returns the mean embedding for each document.
        """
        try:
            debug_log(f"Starting embedding function for {len(input)} documents")
            embeddings_list = []

            for document in input:
                try:
                    # Chunk text recursively to ensure each chunk is within the limit
                    chunks = chunk_text_recursively(document)
                    chunk_embeddings = []
                    
                    debug_log(f"Processing {len(chunks)} chunks for document")
                    for chunk in chunks:
                        # Generate embeddings for each chunk
                        embedding = embed(chunk)
                        chunk_embeddings.append(embedding)
                    
                    # If we got embeddings for chunks, average them
                    if chunk_embeddings:
                        # Calculate the mean embedding across all chunks
                        mean_embedding = np.mean(chunk_embeddings, axis=0).tolist()
                        embeddings_list.append(mean_embedding)
                    else:
                        # Handle empty documents with zero embeddings
                        debug_log(f"Warning: No chunks were generated for document: {document[:100]}...")
                        empty_dims = 3072  # Dimensions for text-embedding-3-large
                        embeddings_list.append([0.0] * empty_dims)
                except Exception as e:
                    error_trace = traceback.format_exc()
                    debug_log(f"ERROR embedding document: {str(e)}\n{error_trace}")
                    # Provide fallback embedding
                    empty_dims = 3072  # Dimensions for text-embedding-3-large
                    embeddings_list.append([0.0] * empty_dims)
            
            debug_log(f"Completed embedding for {len(input)} documents")
            return embeddings_list
        except Exception as e:
            error_trace = traceback.format_exc()
            debug_log(f"CRITICAL ERROR in MyEmbeddingFunction.__call__: {str(e)}\n{error_trace}")
            # Provide fallback embeddings for all documents
            empty_dims = 3072  # Dimensions for text-embedding-3-large
            return [[0.0] * empty_dims] * len(input)


# Initialize the embedding function first - will be used when creating collections
embedding_function = MyEmbeddingFunction()

# Initialize chromadb client and collection after embedding function is defined
try:
    debug_log("Initializing ChromaDB client...")
    chroma_client = chromadb.HttpClient(host="localhost", port=8000)
    debug_log("ChromaDB client initialized, creating collection...")
    
    # Create collection with embedding function
    collection = chroma_client.get_or_create_collection(
        name="documentation_snippets",
        embedding_function=embedding_function
    )
    debug_log("Collection created successfully")
except Exception as e:
    error_trace = traceback.format_exc()
    debug_log(f"ERROR initializing ChromaDB: {str(e)}\n{error_trace}")
    # Continue with None values

def chunk_text_recursively(
    text: str, 
    max_tokens: int = 8190, 
    separators: list[str] = ["\n\n", "\n", ". ", " ", ""],
    is_recursive_call: bool = False
) -> list[str]:
    """
    Recursively chunk text using a hierarchy of separators, ensuring each chunk
    stays under the specified token limit.
    
    The function tries to use the largest separator first (e.g., double newlines),
    then falls back to smaller separators only when necessary.
    
    Args:
        text: The text to chunk
        max_tokens: Maximum tokens per chunk (default: 8190)
        separators: Ordered list of separators to try, from largest to smallest
            Default: ["\n\n", "\n", ". ", " ", ""] where "" means character-by-character
        is_recursive_call: Internal flag to track recursive calls
            
    Returns:
        A list of text chunks, each under the max_tokens limit
    """
    if not text:
        debug_log("Warning: Empty text provided to chunk_text_recursively")
        return []
        
    try:
        # For very short text, just return it as a single chunk if it fits
        if count_tokens(text) <= max_tokens:
            return [text]
        
        debug_log(f"Chunking text of length {len(text)} with separator {separators[0] if separators else 'none'}")
        
        # Initialize variables
        chunks = []
        current_chunk = ""
        
        # Get the current separator and the remaining ones for potential recursive calls
        sep = separators[0] if separators else ""
        remaining_separators = separators[1:] if len(separators) > 1 else [""]
        
        # Split the text by the current separator
        parts = text.split(sep) if sep else [c for c in text]
        
        # Process each part
        for i, content in enumerate(parts):
            content_token_count = count_tokens(content)
            current_chunk_token_count = count_tokens(current_chunk)
            combined_token_count = count_tokens(current_chunk + content)
            
            # Check if we can add this content to the current chunk
            if combined_token_count <= max_tokens:
                # Add content to current chunk
                current_chunk += content
                
                # Add separator if this isn't the last part
                if i < len(parts) - 1:
                    if count_tokens(current_chunk + sep) <= max_tokens:
                        current_chunk += sep
                    else:
                        # Current chunk is full, save it and start a new one
                        chunks.append(current_chunk)
                        current_chunk = sep
            else:
                # Content won't fit in current chunk
                if current_chunk:
                    # Save the current chunk
                    chunks.append(current_chunk)
                
                if content_token_count <= max_tokens:
                    # Start a new chunk with just this content
                    current_chunk = content
                    
                    # Add separator if not the last part and it fits
                    if i < len(parts) - 1:
                        if count_tokens(current_chunk + sep) <= max_tokens:
                            current_chunk += sep
                        else:
                            # Separator won't fit with content, save content as a chunk
                            chunks.append(current_chunk)
                            current_chunk = sep
                else:
                    # The current content by itself is too large and needs chunking
                    try:
                        content_chunks = chunk_text_recursively(
                            content, 
                            max_tokens, 
                            remaining_separators,
                            is_recursive_call=True
                        )
                        
                        # Handle content chunks
                        if content_chunks:
                            # Add all but the last content chunk
                            chunks.extend(content_chunks[:-1])
                            
                            # For the last content chunk, check if we can add the separator
                            last_content = content_chunks[-1]
                            if i < len(parts) - 1:  # Not the last part
                                if count_tokens(last_content + sep) <= max_tokens:
                                    # Separator fits with last content chunk
                                    chunks.append(last_content + sep)
                                    current_chunk = ""
                                else:
                                    # Separator doesn't fit with last content
                                    chunks.append(last_content)
                                    if sep and count_tokens(sep) <= max_tokens:
                                        current_chunk = sep
                                    elif sep:
                                        # Very rare case: large separator needs chunking
                                        sep_chunks = chunk_text_recursively(
                                            sep,
                                            max_tokens,
                                            remaining_separators,
                                            is_recursive_call=True
                                        )
                                        chunks.extend(sep_chunks[:-1])
                                        current_chunk = sep_chunks[-1] if sep_chunks else ""
                            else:
                                # Last part, just add the last content chunk
                                chunks.append(last_content)
                                current_chunk = ""
                    except Exception as e:
                        debug_log(f"Error in recursive chunking: {str(e)}")
                        # If recursive chunking fails, try a more aggressive fallback
                        current_chunk = ""  # Reset the current chunk
                        # Try to chunk character by character as a last resort
                        for char in content:
                            if count_tokens(current_chunk + char) <= max_tokens:
                                current_chunk += char
                            else:
                                chunks.append(current_chunk)
                                current_chunk = char
        
        # Don't forget to add the last chunk if it exists
        if current_chunk:
            chunks.append(current_chunk)
        
        # Only perform optimization and verification on the top-level call
        if not is_recursive_call:
            debug_log(f"First-level chunking complete, validating {len(chunks)} chunks")
            # First ensure all chunks are under the token limit
            verified_chunks = []
            for i, chunk in enumerate(chunks):
                chunk_tokens = count_tokens(chunk)
                if chunk_tokens > max_tokens:
                    # This should not happen with the current algorithm, but as a safeguard
                    debug_log(f"Warning: Found chunk exceeding token limit ({chunk_tokens} > {max_tokens})")
                    # Recursively rechunk this oversized chunk
                    rechunked = chunk_text_recursively(
                        chunk,
                        max_tokens,
                        remaining_separators if separators else [""],
                        is_recursive_call=True
                    )
                    verified_chunks.extend(rechunked)
                else:
                    verified_chunks.append(chunk)
            
            debug_log(f"Chunking complete: {len(verified_chunks)} chunks created")
            return verified_chunks
        
        return chunks
    except Exception as e:
        error_trace = traceback.format_exc()
        debug_log(f"ERROR in chunk_text_recursively: {str(e)}\n{error_trace}")
        # Return a safe fallback - split into small fixed-length chunks
        if text:
            fallback_chunks = []
            # Estimate a safe character limit based on token limit
            # Assuming ~4 chars per token as a conservative estimate
            safe_char_limit = max(1, max_tokens // 5)  # At least 1 character
            for i in range(0, len(text), safe_char_limit):
                chunk = text[i:i+safe_char_limit]
                if count_tokens(chunk) <= max_tokens:
                    fallback_chunks.append(chunk)
                else:
                    # Split even smaller if needed
                    for char in chunk:
                        if count_tokens(char) <= max_tokens:
                            fallback_chunks.append(char)
            return fallback_chunks
        return []

def embed(text: str):
    """Synchronous version of the embedding function"""
    try:
        client = OpenAI(api_key=openai_api_key)
        result = client.embeddings.create(
            input=text,
            model="text-embedding-3-large"
        )
        return result.data[0].embedding
    except Exception as e:
        error_trace = traceback.format_exc()
        debug_log(f"ERROR in embed: {str(e)}\n{error_trace}")
        # Return zeros as fallback
        return [0.0] * 3072  # Dimensions for text-embedding-3-large
    
class DocumentationCategory(Enum):
    LANGUAGE = "language"
    FRAMEWORK = "framework"
    LIBRARY = "library"


class Documentation(BaseModel):
    category: DocumentationCategory
    language: str
    language_version: str | None = None
    framework: str | None = None
    framework_version: str | None = None
    library: str | None = None
    library_version: str | None = None
    snippet_id: str
    source_url: str
    title: str
    description: str  # Added description field
    content: str
    concepts: list[str] = []

class TechComponent(BaseModel):
    name: str
    version: str | None = None

class DocumentationQueryRequest(BaseModel):
    query: str = Field(..., description="The search query for documentation")
    category: DocumentationCategory = Field(..., description="The category to query ('language', 'framework', 'library')")
    code_context: list[str] = Field(default=[], description="Optional code context to improve search relevance")
    languages: list[TechComponent] | None = Field(None, description="Programming languages and their versions to search documentation for")
    frameworks: list[TechComponent] | None = Field(None, description="Frameworks and their versions to search documentation for")
    libraries: list[TechComponent] | None = Field(None, description="Libraries/packages and their versions to search documentation for")
    n_results: int = Field(5, description="Number of results to return")


def format_documentation_results(results):
    """Format ChromaDB results into a readable markdown format"""
    if not results or not results.get('documents') or not results['documents'][0]:
        return "No documentation snippets found matching your query."
    
    # Get the first (and only) query result
    documents = results['documents'][0]
    metadatas = results['metadatas'][0]
    distances = results.get('distances', [[]])[0]
    
    formatted_results = "# Documentation Snippets\n\n"
    
    for i, (doc, metadata, distance) in enumerate(zip(documents, metadatas, distances)):
        # Create a header based on the metadata
        tech_info = []
        
        # Add information based on the document category
        category = metadata.get('category')
        
        if category == 'language':
            tech_info.append(f"Language: {metadata.get('language')} {metadata.get('language_version', '')}")
        elif category == 'framework':
            tech_info.append(f"Framework: {metadata.get('framework')} {metadata.get('framework_version', '')}")
            if metadata.get('language'):
                tech_info.append(f"Language: {metadata.get('language')} {metadata.get('language_version', '')}")
        elif category == 'library':
            tech_info.append(f"Library: {metadata.get('library')} {metadata.get('library_version', '')}")
            if metadata.get('language'):
                tech_info.append(f"Language: {metadata.get('language')} {metadata.get('language_version', '')}")
            if metadata.get('framework'):
                tech_info.append(f"Framework: {metadata.get('framework')} {metadata.get('framework_version', '')}")
        
        title = metadata.get('title', 'Documentation Snippet')
        description = metadata.get('description', 'No description available')
        source_url = metadata.get('source_url', '')
        
        formatted_results += f"## {i+1}. {title}\n\n"
        formatted_results += f"*{description}*\n\n"
        formatted_results += f"**Tech Stack**: {' | '.join(tech_info)}\n\n"
        
        if source_url:
            formatted_results += f"**Source**: [{source_url}]({source_url})\n\n"
        
        # Add the actual documentation content
        formatted_results += f"```\n{doc}\n```\n\n"
        
        # Add a separator between snippets
        if i < len(documents) - 1:
            formatted_results += "---\n\n"
    
    return formatted_results


snippet_search_name = "Query Documentation Snippets"
snippet_search_description = """
Search for documentation snippets across multiple languages, frameworks, and libraries.

This tool allows you to find relevant documentation when working with multiple technologies simultaneously.
For example, you might need to see how to use a specific-version of a Python library with a specific web framework, or how different libraries versions interact.
You will be able to generate version-specific syntax accurate code using this tool.

You can provide:
    - A search query describing what you're looking for
    - Optional code context to improve relevance in the form of a list of code snippets
    - Lists of languages, frameworks, and libraries with their versions
    - The number of results you want

Returns formatted documentation snippets with clear source attribution.
"""

@mcp.tool(name="query-documentation-snippets")
async def query_documentation(request: DocumentationQueryRequest):
    """
    Search for documentation snippets across multiple languages, frameworks, and libraries.

    This tool allows you to find relevant documentation when working with multiple technologies simultaneously.
    For example, you might need to see how to use a specific-version of a Python library with a specific web framework, or how different libraries versions interact.
    You will be able to generate version-specific syntax accurate code using this tool.

    You can provide:
        - A search query describing what you're looking for
        - Optional code context to improve relevance in the form of a list of code snippets
        - Lists of languages, frameworks, and libraries with their versions
        - The number of results you want

    Returns formatted documentation snippets with clear source attribution.
    """
    try:
        debug_log(f"Starting query_documentation with query: {request.query}")
        
        # Check if collection is available (using global variable now)
        if collection is None:
            error_msg = "ChromaDB collection is not available"
            debug_log(error_msg)
            
            return """
# ChromaDB Not Available

The documentation search tool is currently unavailable because the ChromaDB collection couldn't be initialized.

## Possible Solutions
1. Make sure ChromaDB is running on localhost:8000
2. Try reinstalling ChromaDB dependencies: `pip install chromadb --force-reinstall`
3. Check logs for specific error details

Until this issue is resolved, documentation search capabilities will be limited.
"""
            
        debug_log(f"Processing query: {request.query}")
        
        # Build the filter conditions for ChromaDB
        where_conditions = []
        
        # Base filter for the requested documentation category
        base_filter = {"category": request.category.value}
        debug_log(f"Base filter: {base_filter}")
        
        # Process the specified category with associated components
        if request.category == DocumentationCategory.LANGUAGE:
            debug_log("Processing LANGUAGE category")
            if request.languages:
                for lang in request.languages:
                    lang_condition = {"language": lang.name}
                    if lang.version:
                        lang_condition["language_version"] = lang.version
                    where_conditions.append({**base_filter, **lang_condition})
            else:
                # If no specific languages provided, search all within the category
                where_conditions.append(base_filter)
            
        elif request.category == DocumentationCategory.FRAMEWORK:
            if request.frameworks:
                for framework in request.frameworks:
                    framework_condition = {"framework": framework.name}
                    if framework.version:
                        framework_condition["framework_version"] = framework.version
                    
                    # Link frameworks to specified languages if provided
                    if request.languages:
                        for lang in request.languages:
                            lang_condition = {"language": lang.name}
                            if lang.version:
                                lang_condition["language_version"] = lang.version
                            where_conditions.append({
                                **base_filter,
                                **framework_condition,
                                **lang_condition
                            })
                    else:
                        where_conditions.append({**base_filter, **framework_condition})
            else:
                # If no specific frameworks provided, search all within the category
                where_conditions.append(base_filter)
            
        elif request.category == DocumentationCategory.LIBRARY:
            if request.libraries:
                for library in request.libraries:
                    library_condition = {"library": library.name}
                    if library.version:
                        library_condition["library_version"] = library.version
                    
                    # Handle libraries in specific language/framework contexts
                    if request.languages or request.frameworks:
                        # If both languages and frameworks specified, create combinations
                        if request.languages and request.frameworks:
                            for lang in request.languages:
                                for framework in request.frameworks:
                                    lang_condition = {"language": lang.name}
                                    if lang.version:
                                        lang_condition["language_version"] = lang.version
                                        
                                    framework_condition = {"framework": framework.name}
                                    if framework.version:
                                        framework_condition["framework_version"] = framework.version
                                    
                                    where_conditions.append({
                                        **base_filter,
                                        **library_condition,
                                        **lang_condition,
                                        **framework_condition
                                    })
                        # Only languages specified
                        elif request.languages:
                            for lang in request.languages:
                                lang_condition = {"language": lang.name}
                                if lang.version:
                                    lang_condition["language_version"] = lang.version
                                where_conditions.append({
                                    **base_filter,
                                    **library_condition,
                                    **lang_condition
                                })
                        # Only frameworks specified
                        elif request.frameworks:
                            for framework in request.frameworks:
                                framework_condition = {"framework": framework.name}
                                if framework.version:
                                    framework_condition["framework_version"] = framework.version
                                where_conditions.append({
                                    **base_filter,
                                    **library_condition,
                                    **framework_condition
                                })
                    else:
                        # No language/framework context provided
                        where_conditions.append({**base_filter, **library_condition})
            else:
                # If no specific libraries provided, search all within the category
                where_conditions.append(base_filter)
        
        # Construct the final where filter
        where_filter = {"$or": where_conditions} if len(where_conditions) > 1 else where_conditions[0] if where_conditions else {}
        
        # Construct the query text including any code context
        query_text = request.query
        if request.code_context:
            context_text = "\n".join(request.code_context)
            query_text = f"Code context: {context_text}\n\nQuery: {request.query}"
        
        # Execute the query against ChromaDB
        debug_log("Executing ChromaDB query...")
        results = collection.query(
            query_texts=[query_text],
            n_results=request.n_results,
            where=where_filter
        )
        debug_log("Query completed successfully")
        
        # Format the results
        return format_documentation_results(results)
    except Exception as e:
        error_trace = traceback.format_exc()
        debug_log(f"ERROR in query_documentation: {str(e)}\n{error_trace}")
        return f"Error executing query: {str(e)}"


list_documentation_available_name = "list-documentation-components"
list_documentation_available_description = """
Retrieve all available documentation components (languages, frameworks, or libraries)
along with their available versions from the documentation snippets database.
The category should be one of "language", "framework", or "library".
"""

@mcp.tool(name=list_documentation_available_name, description=list_documentation_available_description)
async def list_documentation_components(category: str) -> str:
    """
    Retrieve all available documentation components (languages, frameworks, or libraries)
    along with their available versions from the documentation snippets database.
    The category should be one of "language", "framework", or "library".
    """
    try:
        debug_log(f"Starting list_documentation_components with category: {category}")
        if category not in ["language", "framework", "library"]:
            debug_log(f"Invalid category: {category}")
            return "Invalid category. Must be one of: language, framework, library."

        # Check if collection is available (using global variable)
        if collection is None:
            error_msg = "ChromaDB collection is not available"
            debug_log(error_msg)
            
            return """
# ChromaDB Not Available

The documentation components listing tool is currently unavailable because the ChromaDB collection couldn't be initialized.

## Possible Solutions
1. Make sure ChromaDB is running on localhost:8000
2. Try reinstalling ChromaDB dependencies: `pip install chromadb --force-reinstall`
3. Check logs for specific error details

Until this issue is resolved, documentation listing capabilities will be limited.
"""
            
        debug_log(f"Listing components for category: {category}")
        
        # Retrieve all documents with matching category using ChromaDB's get() method
        results = collection.get(where={"category": category})
        debug_log("Get operation completed successfully")
        metadatas = results.get("metadatas", [])

        items = set()
        for meta in metadatas:
            if category == "language":
                name = meta.get("language")
                version = meta.get("language_version", "")
                if name:
                    items.add((name, version))
            elif category == "framework":
                name = meta.get("framework")
                version = meta.get("framework_version", "")
                if name:
                    items.add((name, version))
            elif category == "library":
                name = meta.get("library")
                version = meta.get("library_version", "")
                if name:
                    items.add((name, version))

        if not items:
            return f"No documentation components found for category: {category}."

        response = f"Available {category.capitalize()} Components:\n\n"
        for name, version in sorted(items):
            response += f"- {name}"
            if version:
                response += f" (Version: {version})"
            response += "\n"
        return response
    except Exception as e:
        error_trace = traceback.format_exc()
        debug_log(f"ERROR in list_documentation_components: {str(e)}\n{error_trace}")
        return f"Error listing components: {str(e)}"