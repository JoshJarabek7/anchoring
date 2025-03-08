"""
Documentation Snippets Server

A Model Context Protocol (MCP) server that provides version-pinned documentation snippets 
for various languages, frameworks, and libraries.
"""
from __future__ import annotations
import asyncio
import os
import sys
import traceback
import logging
from typing import Any, AsyncIterator
from enum import Enum
from contextlib import asynccontextmanager
from dataclasses import dataclass

import numpy as np
from chromadb import AsyncHttpClient
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from semantic_text_splitter import TextSplitter
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP, Context

# Load environment variables
load_dotenv()

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

class Config:
    """Centralized configuration management."""

    # Server settings
    CHROMADB_HOST = os.environ.get("CHROMADB_HOST", "localhost")
    CHROMADB_PORT = int(os.environ.get("CHROMADB_PORT", "8001"))

    # OpenAI settings
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

    # Embedding model settings
    EMBEDDING_MODEL = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS = 3072
    MAX_TOKENS = 8191

    # Server dependencies
    DEPENDENCIES = [
        "openai",
        "pydantic",
        "chromadb",
        "tiktoken",
        "numpy",
        "semantic-text-splitter"
    ]

    @classmethod
    def setup_logging(cls, level: str = "DEBUG") -> logging.Logger:
        """Set up and configure logging."""
        numeric_level = getattr(logging, level.upper(), logging.INFO)

        # Clear any existing handlers
        root = logging.getLogger()
        if root.handlers:
            for handler in root.handlers:
                root.removeHandler(handler)
        
        # Configure logging
        logging.basicConfig(
            level=numeric_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            stream=sys.stderr
        )

        return logging.getLogger("docs-server")
    

# Initialize logger
logger = Config.setup_logging()

#------------------------------------------------------------------------------
# Data Models
#------------------------------------------------------------------------------

class DocumentationCategory(str, Enum):
    """Categories of documentation."""
    LANGUAGE = "language"
    FRAMEWORK = "framework"
    LIBRARY = "library"

class TechComponent(BaseModel):
    """Model for a technology component with optional version."""
    name: str
    version: str | None = None

# Ensure TechComponent is fully initialized
TechComponent.model_rebuild()

class Documentation(BaseModel):
    """Model for a documentation snippet."""
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
    description: str
    content: str
    concepts: list[str] = []

# Ensure Documentation is fully initialized
Documentation.model_rebuild()

class DocumentationQueryRequest(BaseModel):
    """Model for a documentation search request."""
    query: str = Field(..., description="The search query for documentation")
    category: DocumentationCategory = Field(..., description="The category to query ('language', 'framework', 'library')")
    code_context: list[str] = Field(default=[], description="Optional code context to improve search relevance")
    languages: list[TechComponent] | None = Field(None, description="Programming languages and their versions to search documentation for")
    frameworks: list[TechComponent] | None = Field(None, description="Frameworks and their versions to search documentation for")
    libraries: list[TechComponent] | None = Field(None, description="Libraries/packages and their versions to search documentation for")
    n_results: int = Field(5, description="Number of results to return")

# Ensure DocumentationQueryRequest is fully initialized
DocumentationQueryRequest.model_rebuild()

#------------------------------------------------------------------------------
# Embedding Service
#------------------------------------------------------------------------------

class EmbeddingService:
    """Service for embedding documents using OpenAI's embedding models."""
    
    def __init__(self):
        """Initialize the embedding service."""
        self.api_key = Config.OPENAI_API_KEY
        
        if not self.api_key:
            logger.warning("OPENAI_API_KEY is not set. Embeddings will return zeros.")
        
        self.splitter = TextSplitter.from_tiktoken_model(
            Config.EMBEDDING_MODEL, 
            Config.MAX_TOKENS
        )

    async def embed_text(self, text: str) -> list[float]:
        """Embed a single text string using OpenAI's embedding model."""
        try:
            if not self.api_key:
                return [0.0] * Config.EMBEDDING_DIMENSIONS
            
            client = AsyncOpenAI(api_key=self.api_key)
            result = await client.embeddings.create(
                input=text,
                model=Config.EMBEDDING_MODEL
            )
            return result.data[0].embedding
        except Exception as e:
            logger.error(f"Error in embed_text: {str(e)}\n{traceback.format_exc()}")
            # Return zeros as fallback
            return [0.0] * Config.EMBEDDING_DIMENSIONS
        
# EmbeddingFunction class removed - we now handle embeddings directly
    
#------------------------------------------------------------------------------
# Database Service
#------------------------------------------------------------------------------

class DatabaseService:
    """Service for managing and querying the ChromaDB database."""

    def __init__(self, embedding_service: EmbeddingService):
        """Initialize the database service."""
        self.embedding_service = embedding_service
        self.client = None
        self.collection = None

    async def initialize_database(self):
        """Initialize the ChromaDB client and collection."""
        try:
            logger.info(f"Initializing ChromaDB client at {Config.CHROMADB_HOST}:{Config.CHROMADB_PORT}")

            self.client = await AsyncHttpClient(
                host=Config.CHROMADB_HOST,
                port=Config.CHROMADB_PORT
            )
            
            logger.info("Creating documentation_snippets collection with maximum accuracy settings")
            # Create collection without an embedding function, we'll handle embeddings ourselves
            self.collection = await self.client.get_or_create_collection(
                name="documentation_snippets",
                metadata={
                    "hnsw:space": "cosine",           # Cosine distance for text embeddings
                    "hnsw:construction_ef": 1000,     # Extremely high for maximum index quality (default: 100)
                    "hnsw:M": 128,                    # Very high connectivity (default: 16)
                    "hnsw:search_ef": 500,            # Exhaustive search exploration (default: 10)
                    "hnsw:num_threads": 16,           # High parallelism for construction
                    "hnsw:resize_factor": 1.2,        # Standard resize factor
                    "hnsw:batch_size": 500,           # Larger batch size for better indexing
                    "hnsw:sync_threshold": 2000       # Higher threshold for fewer disk syncs
                }
            )
            logger.info("ChromaDB collection initialized successfully with maximum accuracy settings")

        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {str(e)}\n{traceback.format_exc()}")

    def is_available(self) -> bool:
        """Check if the database is available for use."""
        return self.collection is not None
    
    def get_unavailable_message(self) -> str:
        """Get a standardized message when the database is unavailable."""
        return f"""
        # ChromaDB Not Available

        The documentation search tool is currently unavailable because the ChromaDB collection couldn't be initialized.

        ## Possible Solutions
        1. Make sure ChromaDB is running on {Config.CHROMADB_HOST}:{Config.CHROMADB_PORT}
        2. Try reinstalling ChromaDB dependencies: `pip install chromadb --force-reinstall`
        3. Check logs for specific error details

        Until this issue is resolved, documentation search capabilities will be limited.
        """

#------------------------------------------------------------------------------
# Documentation Service
#------------------------------------------------------------------------------

class DocumentationService:
    """Service for querying and formatting documentation."""
    
    def __init__(self, db_service: DatabaseService):
        """Initialize with a database service."""
        self.db_service = db_service
    
    def _build_search_filters(self, request: DocumentationQueryRequest) -> dict[str, Any]:
        """Build ChromaDB search filters based on the request."""
        where_conditions = []
        
        # Base filter for the requested documentation category
        base_filter = {"category": request.category}
        logger.debug(f"Base filter: {base_filter}")
        
        # Process the specified category with associated components
        if request.category == DocumentationCategory.LANGUAGE:
            logger.debug("Processing LANGUAGE category")
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
        if len(where_conditions) > 1:
            where_filter = {"$or": where_conditions}
        elif where_conditions:
            where_filter = where_conditions[0]
        else:
            where_filter = {}
        
        # Handle multiple fields in filter appropriately for ChromaDB
        if not any(k.startswith('$') for k in where_filter.keys()) and len(where_filter) > 1:
            restructured_filter = {"$and": []}
            for key, value in where_filter.items():
                restructured_filter["$and"].append({key: value})
            where_filter = restructured_filter
        
        return where_filter
    
    async def query_documentation(self, request: DocumentationQueryRequest) -> Any:
        """Query documentation snippets based on the provided request."""
        if not self.db_service.is_available():
            logger.error("ChromaDB collection is not available")
            return None
        
        logger.info(f"Processing query: {request.query}")
        
        try:
            # Build the where filter
            where_filter = self._build_search_filters(request)
            
            # Construct the query text including any code context
            query_text = request.query
            if request.code_context:
                context_text = "\n".join(request.code_context)
                query_text = f"Code context: {context_text}\n\nQuery: {request.query}"
            
            # Generate embeddings for the query text using our embedding service
            logger.info("Generating query embeddings")
            query_embedding = await self.db_service.embedding_service.embed_text(query_text)
            
            # Execute the query against ChromaDB
            logger.info("Executing ChromaDB query")
            collection = self.db_service.collection
            if collection is None:
                logger.error("Collection is None, cannot execute query")
                return None
            
            # Query using the pre-generated embeddings instead of letting ChromaDB generate them
            results = await collection.query(
                query_embeddings=[query_embedding],  # Pass our pre-generated embeddings
                n_results=request.n_results,
                where=where_filter
            )
            logger.info("Query completed successfully")
            return results
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Error executing query: {str(e)}\n{error_trace}")
            return None
    
    def format_results(self, results: dict[str, Any]) -> str:
        """Format ChromaDB results into a readable markdown format."""
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
    
    async def list_components(self, category: str) -> list[dict[str, str]]:
        """List all available components for a given category."""
        if not self.db_service.is_available():
            logger.error("ChromaDB collection is not available")
            return []
        
        if category not in ["language", "framework", "library"]:
            logger.error(f"Invalid category: {category}")
            return []
            
        logger.info(f"Listing components for category: {category}")
        
        try:
            # Retrieve all documents with matching category
            collection = self.db_service.collection
            if collection is None:
                logger.error("Collection is None, cannot list components")
                return []
            
            results = await collection.get(where={"category": category})
            if results is None:
                return []
                
            # Handle case where results is not a dictionary
            if not hasattr(results, 'get'):
                logger.error(f"Unexpected results type: {type(results)}")
                return []
                
            metadatas = results.get("metadatas", [])
            if metadatas is None:
                metadatas = []
            
            # Extract unique components
            items = set()
            for meta in metadatas:
                if category == "language":
                    name = meta.get("language")
                    version = meta.get("language_version", "")
                elif category == "framework":
                    name = meta.get("framework")
                    version = meta.get("framework_version", "")
                elif category == "library":
                    name = meta.get("library")
                    version = meta.get("library_version", "")
                
                if name:
                    items.add((name, version))
            
            # Convert to list of dictionaries
            return [{"name": name, "version": version} for name, version in sorted(items)]
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Error listing components: {str(e)}\n{error_trace}")
            return []
    
    def format_components_list(self, items: list[dict[str, str]], category: str) -> str:
        """Format a list of components into a readable string."""
        if not items:
            return f"No documentation components found for category: {category}."
        
        response = f"Available {category.capitalize()} Components:\n\n"
        for item in items:
            response += f"- {item['name']}"
            if item.get('version'):
                response += f" (Version: {item['version']})"
            response += "\n"
            
        return response



#------------------------------------------------------------------------------
# Application Context and Lifespan Management
#------------------------------------------------------------------------------

@dataclass
class AppContext:
    """Application context holding initialized services."""
    db_service: "DatabaseService"
    docs_service: "DocumentationService"
    endpoints: "DocumentationEndpoints"

@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """
    Manage application lifecycle with proper startup/shutdown handling.
    
    This ensures that all services are properly initialized before the server
    starts accepting requests, and that they are properly cleaned up when
    the server shuts down.
    """
    try:
        logger.info("Starting Documentation Snippets server initialization")
        
        # Set up service stack in the correct order
        embedding_service = EmbeddingService()
        logger.info("Embedding service initialized")
        
        db_service = DatabaseService(embedding_service)
        logger.info("Database service created")
        
        # Important: actually initialize the database connection
        # before yielding control back to the server
        logger.info("Initializing database connection...")
        await db_service.initialize_database()
        logger.info("Database connection initialized")
        
        docs_service = DocumentationService(db_service)
        logger.info("Documentation service initialized")
        
        endpoints = DocumentationEndpoints(docs_service)
        logger.info("API endpoints initialized")
        
        # Return initialized context to the server
        yield AppContext(
            db_service=db_service,
            docs_service=docs_service,
            endpoints=endpoints
        )
        logger.info("Server is up and running with all services initialized")
        
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"Error during server initialization: {str(e)}\n{error_trace}")
        # Re-raise the exception to prevent the server from starting
        # if initialization failed
        raise
    finally:
        # Shutdown notification
        logger.info("Shutting down Documentation Snippets server...")
        logger.info("Server shutdown complete")

#------------------------------------------------------------------------------
# MCP Endpoints
#------------------------------------------------------------------------------

class DocumentationEndpoints:
    """API endpoints for the documentation search service."""
    
    def __init__(self, docs_service: DocumentationService):
        """Initialize with required services."""
        self.docs_service = docs_service
    
    async def query_documentation(
        self,
        query: str,
        category: str,
        code_context: list[str] = [],
        languages: list[dict[str, str]] | None = None,
        frameworks: list[dict[str, str]] | None = None,
        libraries: list[dict[str, str]] | None = None,
        n_results: int = 15,
        ctx: Context | None = None
    ) -> str:
        """
        Search for documentation snippets across multiple languages, frameworks, and libraries.

        This tool allows you to find relevant documentation when working with multiple technologies simultaneously.
        For example, you might need to see how to use a specific-version of a Python library with a specific web framework, or how different libraries versions interact.
        You will be able to generate version-specific syntax accurate code using this tool.

        Args:
            query: The search query describing what you're looking for
            category: The category to search in ("language", "framework", "library")
            code_context: Optional code snippets to improve search relevance
            languages: List of languages with their versions to search for
            frameworks: List of frameworks with their versions to search for
            libraries: List of libraries with their versions to search for
            n_results: Number of results to return
            ctx: The MCP context object

        Returns:
            Formatted documentation snippets with clear source attribution
        """
        try:
            # Check if we need to initialize the database connection
            if self.docs_service.db_service.client is None:
                logger.info("Database connection not initialized, initializing now")
                await self.docs_service.db_service.initialize_database()
                
            # Check database availability
            if not self.docs_service.db_service.is_available():
                return self.docs_service.db_service.get_unavailable_message()
            
            # Convert input dictionaries to TechComponent objects
            tech_languages = None
            if languages:
                tech_languages = [TechComponent(**lang) for lang in languages]
                
            tech_frameworks = None
            if frameworks:
                tech_frameworks = [TechComponent(**framework) for framework in frameworks]
                
            tech_libraries = None
            if libraries:
                tech_libraries = [TechComponent(**library) for library in libraries]
            
            # Make sure models are fully built
            DocumentationQueryRequest.model_rebuild()
            TechComponent.model_rebuild()
            
            # Create the request object
            request = DocumentationQueryRequest(
                query=query,
                category=DocumentationCategory(category),
                code_context=code_context,
                languages=tech_languages,
                frameworks=tech_frameworks,
                libraries=tech_libraries,
                n_results=n_results
            )
            
            # Query the documentation
            results = await self.docs_service.query_documentation(request)
            
            # Format the results
            if results:
                return self.docs_service.format_results(results)
            else:
                return "Error executing query: ChromaDB returned no results"
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Error in query_documentation: {str(e)}\n{error_trace}")
            return f"Error executing query: {str(e)}"
    
    async def list_documentation_components(self, category: str) -> str:
        """
        Retrieve all available documentation components for a category.
        
        The category should be one of "language", "framework", or "library".
        
        Args:
            category: The category to list components for
            
        Returns:
            Formatted list of available components
        """
        try:
            # Check if we need to initialize the database connection
            if self.docs_service.db_service.client is None:
                logger.info("Database connection not initialized, initializing now")
                await self.docs_service.db_service.initialize_database()
                
            # Check database availability
            if not self.docs_service.db_service.is_available():
                return self.docs_service.db_service.get_unavailable_message()
            
            # Check if the category is valid
            if category not in ["language", "framework", "library"]:
                return "Invalid category. Must be one of: language, framework, library."
            
            # List the components
            items = await self.docs_service.list_components(category)
            
            # Format the results
            return self.docs_service.format_components_list(items, category)
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Error in list_documentation_components: {str(e)}\n{error_trace}")
            return f"Error listing components: {str(e)}"

#------------------------------------------------------------------------------
# MCP Server Creation
#------------------------------------------------------------------------------

def create_mcp_server() -> FastMCP:
    """Create and initialize the MCP server with proper lifecycle."""
    
    # Create MCP server with lifespan management
    mcp = FastMCP(
        "Version-Pinned Documentation Snippets", 
        dependencies=Config.DEPENDENCIES,
        lifespan=app_lifespan
    )
    
    # Register tools using the lifespan context
    @mcp.tool(name="query-documentation-snippets")
    async def query_documentation(
        query: str,
        category: str,
        code_context: list[str] = [],
        languages: list[dict[str, str]] | None = None,
        frameworks: list[dict[str, str]] | None = None,
        libraries: list[dict[str, str]] | None = None,
        n_results: int = 15,
        ctx: Context | None = None
    ) -> str:
        """Search for documentation snippets with proper context access."""
        try:
            # Fallback for when context is not available
            if ctx is None or not hasattr(ctx, 'request_context') or ctx.request_context is None:
                logger.warning("Context is not fully available, using fallback")
                # Create documentation service directly
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                docs_service = DocumentationService(db_service)
                endpoints = DocumentationEndpoints(docs_service)
                
                # Call the endpoint method directly
                return await endpoints.query_documentation(
                    query, category, code_context, languages, 
                    frameworks, libraries, n_results, ctx
                )
            
            # Access the endpoints from the lifespan context when available
            app_ctx = ctx.request_context.lifespan_context
            if not isinstance(app_ctx, AppContext):
                logger.warning(f"Invalid context type: {type(app_ctx)}, using fallback")
                # Create documentation service directly
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                docs_service = DocumentationService(db_service)
                endpoints = DocumentationEndpoints(docs_service)
                
                # Call the endpoint method directly
                return await endpoints.query_documentation(
                    query, category, code_context, languages, 
                    frameworks, libraries, n_results, ctx
                )
                
            # Call the endpoint method using context
            return await app_ctx.endpoints.query_documentation(
                query, category, code_context, languages, 
                frameworks, libraries, n_results, ctx
            )
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Error in query_documentation tool: {str(e)}\n{error_trace}")
            return f"Error executing query: {str(e)}"
    
    @mcp.tool(name="list-documentation-components")
    async def list_components(category: str, ctx: Context | None = None) -> str:
        """List documentation components with proper context access."""
        try:
            # Fallback for when context is not available
            if ctx is None or not hasattr(ctx, 'request_context') or ctx.request_context is None:
                logger.warning("Context is not fully available, using fallback")
                # Create documentation service directly
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                docs_service = DocumentationService(db_service)
                endpoints = DocumentationEndpoints(docs_service)
                
                # Call the endpoint method directly
                return await endpoints.list_documentation_components(category)
            
            # Access the endpoints from the lifespan context when available
            app_ctx = ctx.request_context.lifespan_context
            if not isinstance(app_ctx, AppContext):
                logger.warning(f"Invalid context type: {type(app_ctx)}, using fallback")
                # Create documentation service directly
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                docs_service = DocumentationService(db_service)
                endpoints = DocumentationEndpoints(docs_service)
                
                # Call the endpoint method directly
                return await endpoints.list_documentation_components(category)
                
            # Call the endpoint method using context
            return await app_ctx.endpoints.list_documentation_components(category)
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Error in list_components tool: {str(e)}\n{error_trace}")
            return f"Error listing components: {str(e)}"
    
    logger.info("MCP server initialized with proper lifecycle management")
    return mcp

# Create a server instance for MCP CLI to find
server = create_mcp_server()

#------------------------------------------------------------------------------
# Main Entry Point
#------------------------------------------------------------------------------

async def main():
    """Main entry point for the application."""
    try:
        # Create and run MCP server
        mcp = create_mcp_server()
        await mcp.run_stdio_async()
    except Exception as e:
        logger.error(f"Fatal error in main: {str(e)}\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())