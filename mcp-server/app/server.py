# server.py
from mcp.server.fastmcp import FastMCP
import chromadb
from pydantic import BaseModel, Field
from enum import Enum
from openai import AsyncOpenAI
from chromadb import Documents, EmbeddingFunction, Embeddings
import tiktoken
import re
import asyncio
import numpy as np
from dotenv import load_dotenv
import os

load_dotenv()

# Override with localhost to ensure we can connect from outside Docker
chroma_host = os.getenv("CHROMA_HOST", "localhost")
chroma_port = os.getenv("CHROMA_PORT", 8000)
openai_api_key = os.getenv("OPENAI_API_KEY")

chroma_client = chromadb.HttpClient(host=chroma_host, port=chroma_port)

# Create an MCP server
mcp = FastMCP("Version-Pinned Documentation Snippets", dependencies=["openai", "pydantic", "chromadb", "tiktoken", "numpy", "python-dotenv"])


encoder = tiktoken.encoding_name_for_model("text-embedding-3-large")

def count_tokens(string: str):
    return len(encoder.encode(string))

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
        List[str]: List of text chunks, each under the token limit
    """
    # Base case 1: If the text is already under the token limit, return it as is
    tokens = count_tokens(text)
    if tokens <= max_tokens:
        return [text]
    
    # Base case 2: If we've reached the character level and still over the limit,
    # we need to forcibly split (this should be rare with an 8190 token limit)
    if not separators:
        # Try to split roughly at token boundaries (approximate)
        mid_point = len(text) // 2
        return [text[:mid_point], text[mid_point:]]
    
    # Get the current separator and the remaining ones for recursive calls
    separator = separators[0]
    remaining_separators = separators[1:]
    
    # Special case for character-by-character splitting
    if separator == "":
        # Split the text into individual characters for the most granular chunking
        split_parts = list(text)
        # No actual separator to preserve in this case
        parts = [(char, "") for char in split_parts]
    else:
        # Use re.split to preserve the separators
        split_parts = re.split(f'({re.escape(separator)})', text)
        
        # Group the parts and separators together
        # Each odd-indexed item is a separator, each even-indexed item is content
        parts = []
        for i in range(0, len(split_parts), 2):
            content = split_parts[i]
            # Check if there's a separator after this content
            sep = split_parts[i+1] if i+1 < len(split_parts) else ""
            parts.append((content, sep))
    
    chunks = []
    current_chunk = ""
    
    for content, sep in parts:
        # Skip empty content (but preserve separators)
        if not content and not sep:
            continue
            
        # Potential new chunk if we add this content + separator
        potential_chunk = current_chunk + content + sep
        
        # Check if adding this content+separator would exceed the token limit
        if count_tokens(potential_chunk) <= max_tokens:
            # We can add this content+separator to the current chunk
            current_chunk = potential_chunk
        else:
            # First, check if the current chunk has content
            if current_chunk:
                # Add the completed chunk to our results
                chunks.append(current_chunk)
                
                # Start a new chunk with this content+separator
                # Check if just this content+separator is under the limit
                content_token_count = count_tokens(content)
                sep_token_count = count_tokens(sep)
                combined_token_count = count_tokens(content + sep)
                
                # Check if separator alone would push us over the limit
                if combined_token_count <= max_tokens:
                    # Both content and separator fit together under the limit
                    current_chunk = content + sep
                elif content_token_count <= max_tokens:
                    # Content fits but separator would push over limit
                    # Add content to chunks and handle separator separately
                    chunks.append(content)
                    if sep_token_count > 0:  # Only process non-empty separators
                        if sep_token_count <= max_tokens:
                            # Separator fits in its own chunk
                            chunks.append(sep)
                        else:
                            # Very unlikely case: separator alone exceeds limit
                            # Recursively chunk the separator
                            sep_chunks = chunk_text_recursively(
                                sep, 
                                max_tokens, 
                                remaining_separators,
                                is_recursive_call=True
                            )
                            chunks.extend(sep_chunks)
                    current_chunk = ""
                else:
                    # Content itself exceeds the limit, need to recursively chunk it
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
                        if count_tokens(last_content + sep) <= max_tokens:
                            # Separator fits with last content chunk
                            chunks.append(last_content + sep)
                        else:
                            # Separator doesn't fit with last content
                            chunks.append(last_content)
                            if sep and count_tokens(sep) <= max_tokens:
                                chunks.append(sep)
                            elif sep:
                                # Very rare case: large separator needs chunking
                                sep_chunks = chunk_text_recursively(
                                    sep,
                                    max_tokens,
                                    remaining_separators,
                                    is_recursive_call=True
                                )
                                chunks.extend(sep_chunks)
                    
                    # Reset current chunk since we've handled this content and separator
                    current_chunk = ""
            else:
                # The current content by itself is too large and needs chunking
                content_chunks = chunk_text_recursively(
                    content, 
                    max_tokens, 
                    remaining_separators,
                    is_recursive_call=True
                )
                
                # Handle the separator with the last content chunk if possible
                if content_chunks:
                    # Add all but the last content chunk
                    chunks.extend(content_chunks[:-1])
                    
                    # For the last content chunk, try to add the separator
                    last_content = content_chunks[-1]
                    if count_tokens(last_content + sep) <= max_tokens:
                        chunks.append(last_content + sep)
                    else:
                        # Separator doesn't fit with last content chunk
                        chunks.append(last_content)
                        if sep and count_tokens(sep) <= max_tokens:
                            chunks.append(sep)
                        elif sep:
                            # Rare case: large separator needs chunking
                            sep_chunks = chunk_text_recursively(
                                sep,
                                max_tokens,
                                remaining_separators,
                                is_recursive_call=True
                            )
                            chunks.extend(sep_chunks)
    
    # Don't forget to add the last chunk if it exists
    if current_chunk:
        chunks.append(current_chunk)
    
    # Only perform optimization and verification on the top-level call
    if not is_recursive_call:
        # First ensure all chunks are under the token limit
        verified_chunks = []
        for chunk in chunks:
            chunk_tokens = count_tokens(chunk)
            if chunk_tokens > max_tokens:
                # This should not happen with the current algorithm, but as a safeguard
                print(f"Warning: Found chunk exceeding token limit ({chunk_tokens} > {max_tokens})")
                # Recursively rechunk this oversized chunk
                sub_verified = chunk_text_recursively(
                    chunk, 
                    max_tokens, 
                    separators,  # Use all separators for safety
                    is_recursive_call=True
                )
                verified_chunks.extend(sub_verified)
            else:
                verified_chunks.append(chunk)
        
        # Final optimization pass
        optimized_chunks = []
        
        # Try to combine chunks when possible to maximize chunk size
        temp_chunk = ""
        for chunk in verified_chunks:
            potential_chunk = temp_chunk + chunk
            potential_tokens = count_tokens(potential_chunk)
            
            if potential_tokens <= max_tokens:
                temp_chunk = potential_chunk
            else:
                if temp_chunk:
                    optimized_chunks.append(temp_chunk)
                temp_chunk = chunk
        
        # Add the last temporary chunk
        if temp_chunk:
            optimized_chunks.append(temp_chunk)
        
        # Final verification after optimization
        for i, chunk in enumerate(optimized_chunks):
            chunk_tokens = count_tokens(chunk)
            if chunk_tokens > max_tokens:
                raise ValueError(
                    f"Error: Chunk {i} exceeds max_tokens after optimization: "
                    f"{chunk_tokens} > {max_tokens}. This is a bug in the algorithm."
                )
        
        return optimized_chunks
    
    return chunks

async def embed(text: str):
    openai = AsyncOpenAI(api_key=openai_api_key)
    result = await openai.embeddings.create(
        input=text,
        model="text-embedding-3-large"
    )
    return result.data[0].embedding


class MyEmbeddingFunction(EmbeddingFunction):
    def __call__(self, input: Documents) -> Embeddings:
        """
        Processes a list of documents, recursively chunks them, computes embeddings,
        and returns the mean embedding for each document.
        """
        # Convert to async and use asyncio.run to avoid signature issues
        return asyncio.run(self._async_embed(input))
        
    async def _async_embed(self, input: Documents) -> Embeddings:
        """Internal async implementation of the embedding function"""
        embeddings_list = []

        for document in input:
            # Chunk text recursively to ensure each chunk is within the limit
            chunks = chunk_text_recursively(document)
            
            # Compute embeddings for each chunk asynchronously
            chunk_embeddings = await asyncio.gather(*(embed(chunk) for chunk in chunks))
            
            # Convert embeddings to NumPy arrays
            chunk_embeddings = np.array(chunk_embeddings, dtype=np.float32)
            
            # Compute mean embedding for the document
            mean_embedding = np.mean(chunk_embeddings, axis=0)
            
            # Append to results
            embeddings_list.append(mean_embedding)

        return embeddings_list

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


# Create a collection
collection = chroma_client.get_or_create_collection(
    name="documentation_snippets",
    embedding_function=MyEmbeddingFunction()
)


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
        source_url = metadata.get('source_url', '')
        
        formatted_results += f"## {i+1}. {title}\n\n"
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

@mcp.tool(name="Query Documentation Snippets")
def query_documentation(request: DocumentationQueryRequest):
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
    # Build the filter conditions for ChromaDB
    where_conditions = []
    
    # Base filter for the requested documentation category
    base_filter = {"category": request.category.value}
    
    # Process the specified category with associated components
    if request.category == DocumentationCategory.LANGUAGE:
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
    results = collection.query(
        query_texts=[query_text],
        n_results=request.n_results,
        where=where_filter
    )
    
    # Format the results
    return format_documentation_results(results)


list_documentation_available_name = "List Documentations Available"
list_documentation_available_description = """
Retrieve all available documentation components (languages, frameworks, or libraries)
along with their available versions from the documentation snippets database.
The category should be one of "language", "framework", or "library".
"""

@mcp.tool(name=list_documentation_available_name, description=list_documentation_available_description)
def list_documentation_components(category: str) -> str:
    """
    Retrieve all available documentation components (languages, frameworks, or libraries)
    along with their available versions from the documentation snippets database.
    The category should be one of "language", "framework", or "library".
    """
    if category not in ["language", "framework", "library"]:
        return "Invalid category. Must be one of: language, framework, library."

    # Retrieve all documents with matching category using ChromaDB's get() method
    results = collection.get(where={"category": category})
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

