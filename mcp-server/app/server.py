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
import json

import numpy as np
from chromadb import AsyncHttpClient
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from semantic_text_splitter import TextSplitter
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP, Context

from .vector_db import DocumentSnippet, DBConnectionConfig, ContextType
from .vector_db.chroma_provider import ChromaDBProvider
from .vector_db.pinecone_provider import PineconeProvider

# Load environment variables
load_dotenv()
logger = None

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

class Config:
    """Centralized configuration management."""

    # Server settings
    CHROMADB_HOST = os.environ.get("CHROMADB_HOST", "localhost")
    CHROMADB_PORT = int(os.environ.get("CHROMADB_PORT", "8001"))
    MCP_PORT = int(os.environ.get("MCP_PORT", "8080"))

    # OpenAI settings
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

    # Context settings
    CONTEXT_SOURCE = os.environ.get("CONTEXT_SOURCE", "local")
    if CONTEXT_SOURCE not in ["local", "shared"]:
        print(f"Invalid CONTEXT_SOURCE '{CONTEXT_SOURCE}', defaulting to 'local'")
        CONTEXT_SOURCE = "local"

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
        "semantic-text-splitter",
        "pinecone"
    ]

    @classmethod
    def setup_logging(cls, level: str = "DEBUG") -> logging.Logger:
        """Set up and configure logging."""
        global logger
        numeric_level = getattr(logging, level.upper(), logging.INFO)

        # Clear any existing handlers
        root = logging.getLogger()
        if root.handlers:
            for handler in root.handlers:
                root.removeHandler(handler)
        
        # Create formatters
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
        )
        
        # Ensure logs directory exists
        os.makedirs('logs', exist_ok=True)
        
        # Set up file handler with relative path
        file_handler = logging.FileHandler('./logs/mcp_server.log')
        file_handler.setFormatter(formatter)
        file_handler.setLevel(numeric_level)
        
        # Set up console handler
        console_handler = logging.StreamHandler(sys.stderr)
        console_handler.setFormatter(formatter)
        console_handler.setLevel(numeric_level)
        
        # Configure root logger
        root.setLevel(numeric_level)
        root.addHandler(file_handler)
        root.addHandler(console_handler)

        logger = logging.getLogger("docs-server")
        logger.info("=== MCP Documentation Server Starting ===")
        logger.info(f"Environment Configuration:")
        logger.info(f"  CHROMADB_HOST: {cls.CHROMADB_HOST}")
        logger.info(f"  CHROMADB_PORT: {cls.CHROMADB_PORT}")
        logger.info(f"  MCP_PORT: {cls.MCP_PORT}")
        logger.info(f"  CONTEXT_SOURCE: {cls.CONTEXT_SOURCE}")
        logger.info(f"  OPENAI_API_KEY: {'Set' if cls.OPENAI_API_KEY else 'Not Set'}")
        logger.info(f"  EMBEDDING_MODEL: {cls.EMBEDDING_MODEL}")
        
        return logger

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
    """Service for managing vector database operations."""
    
    def __init__(self, embedding_service: EmbeddingService):
        """Initialize database service."""
        logger.info("Creating DatabaseService instance")
        self.embedding_service = embedding_service
        self.provider = None
        self.context_type = Config.CONTEXT_SOURCE
        logger.info(f"Initial context type set to: {self.context_type}")
            
    async def initialize_database(self):
        """Initialize the database connection."""
        logger.info("Initializing database connection")
        try:
            # Initialize the appropriate provider based on context type
            if self.context_type == "local":
                self.provider = ChromaDBProvider()
            else:
                self.provider = PineconeProvider()
                
            # Initialize the provider
            await self.provider.initialize()
            
            # Create or get the collection
            await self.provider.get_or_create_collection(
                name="documentation_snippets",
                metadata={
                    "description": "Documentation snippets for various languages, frameworks, and libraries"
                }
            )
            
            logger.info("Database initialization completed successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database: {str(e)}")
            logger.error(traceback.format_exc())
            raise
            
    def is_available(self) -> bool:
        """Check if the database is available."""
        return self.provider is not None and self.provider.is_available()
            
    def get_unavailable_message(self) -> str:
        """Get a message explaining why the database is unavailable."""
        if self.provider is None:
            return "Database provider not initialized"
        return "Database is not available"

    async def switch_context(self, context_type: str) -> str:
        """Switch between local and shared contexts."""
        if context_type not in ["local", "shared"]:
            raise ValueError("Invalid context type. Must be 'local' or 'shared'")
            
        if context_type == self.context_type:
            return f"Already using {context_type} context"
            
        logger.info(f"Switching context from {self.context_type} to {context_type}")
        self.context_type = context_type
        
        # Re-initialize with new context
        await self.initialize_database()
        return f"Switched to {context_type} context"
            
    def get_current_context(self) -> str:
        """Get the current context type."""
        return self.context_type

#------------------------------------------------------------------------------
# Documentation Service
#------------------------------------------------------------------------------

class DocumentationService:
    """Service for querying and formatting documentation."""
    
    def __init__(self, db_service: DatabaseService):
        """Initialize with a database service."""
        self.db_service = db_service
    
    def _build_search_filters(self, request: DocumentationQueryRequest) -> dict[str, Any]:
        """Build vector database search filters based on the request."""
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
        
        # Handle multiple fields in filter appropriately for vector database
        if not any(k.startswith('$') for k in where_filter.keys()) and len(where_filter) > 1:
            restructured_filter = {"$and": []}
            for key, value in where_filter.items():
                restructured_filter["$and"].append({key: value})
            where_filter = restructured_filter
        
        return where_filter
    
    async def query_documentation(self, request: DocumentationQueryRequest) -> Any:
        """Query documentation snippets based on the provided request."""
        if not self.db_service.is_available():
            logger.error("Vector database collection is not available")
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
            
            # Execute the query against vector database
            logger.info("Executing vector database query")
            collection = self.db_service.provider.collection
            if collection is None:
                logger.error("Collection is None, cannot execute query")
                return None
            
            # Query using the pre-generated embeddings instead of letting vector database generate them
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
        """Format vector database results into a readable markdown format."""
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
            logger.error("Vector database collection is not available")
            return []
        
        if category not in ["language", "framework", "library"]:
            logger.error(f"Invalid category: {category}")
            return []
            
        logger.info(f"Listing components for category: {category}")
        
        try:
            # Retrieve all documents with matching category
            collection = self.db_service.provider.collection
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
    """Initialize application services and handle cleanup."""
    logger.info("Initializing application services...")
    
    try:
        # Initialize services
        logger.info("Initializing EmbeddingService...")
        embedding_service = EmbeddingService()
        
        logger.info("Initializing DatabaseService...")
        db_service = DatabaseService(embedding_service)
        await db_service.initialize_database()
        
        logger.info("Initializing DocumentationService...")
        docs_service = DocumentationService(db_service)
        
        logger.info("Initializing DocumentationEndpoints...")
        endpoints = DocumentationEndpoints(docs_service)
        
        logger.info("All services initialized successfully")
        context = AppContext(
            db_service=db_service,
            docs_service=docs_service,
            endpoints=endpoints
        )
        yield context
        
        # Keep the server running until explicitly stopped
        while True:
            await asyncio.sleep(1)
    except Exception as e:
        logger.error(f"Failed to initialize services: {str(e)}")
        logger.error(traceback.format_exc())
        raise
    finally:
        logger.info("Cleaning up application services...")

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
        """Query documentation snippets."""
        logger.info(f"Received documentation query: {query}")
        logger.info(f"Category: {category}, Results requested: {n_results}")
        logger.debug(f"Languages: {languages}")
        logger.debug(f"Frameworks: {frameworks}")
        logger.debug(f"Libraries: {libraries}")
        logger.debug(f"Code context: {code_context}")
        
        try:
            # Initialize services if context is None
            if ctx is None or not hasattr(ctx, 'state') or not hasattr(ctx.state, 'app_context'):
                logger.info("Context not available, initializing services directly")
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                await db_service.initialize_database()
                docs_service = DocumentationService(db_service)
            else:
                app_ctx: AppContext = ctx.state.app_context
                docs_service = app_ctx.docs_service

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
            results = await docs_service.query_documentation(request)
            
            # Format the results
            if results:
                return docs_service.format_results(results)
            else:
                return "Error executing query: Vector database returned no results"
        except Exception as e:
            logger.error(f"Error processing query: {str(e)}")
            logger.error(traceback.format_exc())
            return f"Error executing query: {str(e)}"

def create_mcp_server() -> FastMCP:
    """Create and configure the MCP server."""
    logger.info("Creating MCP server...")
    mcp = FastMCP(
        name="Documentation Snippets",
        description="Provides version-pinned documentation snippets for languages, frameworks, and libraries",
        dependencies=Config.DEPENDENCIES,
        lifespan=app_lifespan
    )
    logger.info(f"MCP server created with name: {mcp.name}")
    
    # Register tools
    logger.info("Registering MCP tools...")
    
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
        """Search for documentation snippets."""
        if ctx is None or not hasattr(ctx, 'state') or not hasattr(ctx.state, 'app_context'):
            logger.info("Context not available, initializing services directly")
            embedding_service = EmbeddingService()
            db_service = DatabaseService(embedding_service)
            await db_service.initialize_database()
            docs_service = DocumentationService(db_service)
            return await docs_service.query_documentation(
                query=query,
                category=category,
                code_context=code_context,
                languages=languages,
                frameworks=frameworks,
                libraries=libraries,
                n_results=n_results,
                ctx=ctx
            )
        else:
            app_ctx: AppContext = ctx.state.app_context
            return await app_ctx.endpoints.query_documentation(
                query=query,
                category=category,
                code_context=code_context,
                languages=languages,
                frameworks=frameworks,
                libraries=libraries,
                n_results=n_results,
                ctx=ctx
            )
    
    @mcp.tool(name="show-context-source")
    async def show_context(ctx: Context | None = None) -> str:
        logger.info("Showing current context source")
        try:
            if ctx is None or not hasattr(ctx, 'state') or not hasattr(ctx.state, 'app_context'):
                logger.info("Context not available, initializing services directly")
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                await db_service.initialize_database()
                return f"Current context: {db_service.get_current_context()}"
            else:
                app_ctx: AppContext = ctx.state.app_context
                return f"Current context: {app_ctx.db_service.get_current_context()}"
        except Exception as e:
            logger.error(f"Error showing context: {str(e)}")
            logger.error(traceback.format_exc())
            return f"Error showing context: {str(e)}"

    @mcp.tool(name="use-local-context")
    async def use_local_context(ctx: Context | None = None) -> str:
        logger.info("Switching to local context")
        try:
            if ctx is None or not hasattr(ctx, 'state') or not hasattr(ctx.state, 'app_context'):
                logger.info("Context not available, initializing services directly")
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                await db_service.initialize_database()
                return await db_service.switch_context("local")
            else:
                app_ctx: AppContext = ctx.state.app_context
                return await app_ctx.db_service.switch_context("local")
        except Exception as e:
            logger.error(f"Error switching to local context: {str(e)}")
            logger.error(traceback.format_exc())
            return f"Error switching context: {str(e)}"

    @mcp.tool(name="use-shared-context")
    async def use_shared_context(ctx: Context | None = None) -> str:
        logger.info("Switching to shared context")
        try:
            if ctx is None or not hasattr(ctx, 'state') or not hasattr(ctx.state, 'app_context'):
                logger.info("Context not available, initializing services directly")
                embedding_service = EmbeddingService()
                db_service = DatabaseService(embedding_service)
                await db_service.initialize_database()
                return await db_service.switch_context("shared")
            else:
                app_ctx: AppContext = ctx.state.app_context
                return await app_ctx.db_service.switch_context("shared")
        except Exception as e:
            logger.error(f"Error switching to shared context: {str(e)}")
            logger.error(traceback.format_exc())
            return f"Error switching context: {str(e)}"

    logger.info("All MCP tools registered")
    return mcp

# Create a server instance for MCP CLI to find
server = create_mcp_server()

async def main():
    """Main entry point for the application."""
    try:
        # Create and run MCP server
        mcp = create_mcp_server()
        await mcp.run_sse_async()  # Port is configured through environment variables
    except Exception as e:
        logger.error(f"Fatal error in main: {str(e)}\n{traceback.format_exc()}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())