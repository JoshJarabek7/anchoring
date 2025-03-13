"""Pinecone implementation of the VectorDBProvider interface."""
from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional, TypedDict, Union, Literal
from enum import Enum
import pinecone
import os
from dotenv import load_dotenv

from . import VectorDBProvider, DocumentSnippet, ContextType

logger = logging.getLogger(__name__)

class DocumentCategory(str, Enum):
    """Document categories matching TypeScript implementation."""
    DOCUMENTATION = "documentation"
    CODE = "code"
    CONVERSATION = "conversation"
    GENERAL = "general"

class DocumentMetadata(TypedDict, total=False):
    """Document metadata matching TypeScript implementation."""
    category: DocumentCategory
    language: Optional[str]
    language_version: Optional[str]
    framework: Optional[str]
    framework_version: Optional[str]
    library: Optional[str]
    library_version: Optional[str]
    title: str
    description: str
    source_url: str
    concepts: List[str]
    status: Optional[str]

class UniversalDocument(TypedDict):
    """Universal document format matching TypeScript implementation."""
    id: str
    content: str
    metadata: DocumentMetadata

class PineconeDocument(TypedDict):
    """Pinecone specific document format."""
    id: str
    values: List[float]
    metadata: Dict[str, Any]  # Pinecone allows arbitrary metadata

class PineconeConfig(TypedDict):
    """Pinecone configuration matching TypeScript implementation."""
    api_key: str
    index_name: str
    environment: str

class PineconeSearchResult(TypedDict):
    """Pinecone search result format."""
    id: str
    metadata: DocumentMetadata
    score: Optional[float]

DocumentFilter = Dict[str, Any]  # Matches TypeScript DocumentFilter type

class PineconeProvider:
    """Pinecone implementation for vector database operations."""
    
    def __init__(self):
        """Initialize Pinecone provider."""
        self.index: Optional[Any] = None
        self.namespace: Optional[str] = None
        
    async def initialize(self) -> None:
        """Initialize connection to Pinecone using environment variables."""
        load_dotenv()  # Load environment variables from .env file
        
        api_key = os.getenv('PINECONE_API_KEY')
        environment = os.getenv('PINECONE_ENVIRONMENT')
        index_name = os.getenv('PINECONE_INDEX_NAME')
        
        if not api_key or not environment or not index_name:
            raise ValueError("Missing required environment variables: PINECONE_API_KEY, PINECONE_ENVIRONMENT, PINECONE_INDEX_NAME")
            
        try:
            # Initialize Pinecone
            pinecone.init(
                api_key=api_key,
                environment=environment
            )
            
            # Get or create the index
            self.index = pinecone.Index(index_name)
            logger.info(f"Initialized Pinecone index '{index_name}'")
        except Exception as e:
            logger.error(f"Failed to initialize Pinecone: {str(e)}")
            raise
            
    async def get_or_create_collection(self, name: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Get or create a Pinecone namespace."""
        if not self.index:
            raise RuntimeError("Pinecone index not initialized")
            
        try:
            # In Pinecone, we use namespaces as collections
            self.namespace = name
            # Note: Pinecone namespaces are created automatically when used
            logger.info(f"Using Pinecone namespace '{name}'")
        except Exception as e:
            logger.error(f"Failed to set namespace: {str(e)}")
            raise
            
    async def add_documents(self, documents: List[UniversalDocument]) -> None:
        """Add documents to the current namespace."""
        if not self.index or not self.namespace:
            raise RuntimeError("No index or namespace selected")
            
        try:
            # Convert documents to Pinecone format
            vectors: List[PineconeDocument] = []
            for doc in documents:
                vector: PineconeDocument = {
                    'id': doc['id'],
                    'values': [],  # Should be provided by caller
                    'metadata': {
                        'content': doc['content'],
                        **doc['metadata']
                    }
                }
                vectors.append(vector)
            
            # Upsert in batches of 100 (Pinecone's recommended batch size)
            batch_size = 100
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                self.index.upsert(
                    vectors=batch,
                    namespace=self.namespace
                )
                
            logger.info(f"Added {len(documents)} documents to namespace '{self.namespace}'")
        except Exception as e:
            logger.error(f"Failed to add documents: {str(e)}")
            raise
            
    async def search_documents(
        self,
        query_embedding: List[float],
        filter_dict: Optional[DocumentFilter] = None,
        limit: int = 5
    ) -> List[UniversalDocument]:
        """Search for documents using the query embedding and optional filters."""
        if not self.index or not self.namespace:
            raise RuntimeError("No index or namespace selected")
            
        try:
            # Query Pinecone
            results = self.index.query(
                vector=query_embedding,
                filter=filter_dict,
                top_k=limit,
                namespace=self.namespace,
                include_metadata=True
            )
            
            # Convert Pinecone results to UniversalDocuments
            documents: List[UniversalDocument] = []
            for match in results.matches:
                content = match.metadata.pop('content')
                doc: UniversalDocument = {
                    'id': match.id,
                    'content': content,
                    'metadata': match.metadata
                }
                documents.append(doc)
                
            return documents
        except Exception as e:
            logger.error(f"Failed to search documents: {str(e)}")
            raise
            
    def is_available(self) -> bool:
        """Check if the database is available for use."""
        return self.index is not None and self.namespace is not None

    async def get_context_type(self) -> Literal["local", "shared"]:
        """Get the current context type."""
        return "shared" 