"""Pinecone implementation of the VectorDBProvider interface."""
from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
import pinecone

from . import VectorDBProvider, DBConnectionConfig, DocumentSnippet, ContextType

logger = logging.getLogger(__name__)

class PineconeProvider(VectorDBProvider):
    """Pinecone implementation of the VectorDBProvider interface."""
    
    def __init__(self):
        """Initialize Pinecone provider."""
        self.index = None
        self.namespace = None
        
    async def initialize(self, config: DBConnectionConfig) -> None:
        """Initialize connection to Pinecone."""
        if config.type != "pinecone":
            raise ValueError(f"Invalid config type {config.type} for PineconeProvider")
            
        if not config.api_key or not config.environment or not config.index_name:
            raise ValueError("Pinecone requires api_key, environment, and index_name configuration")
            
        try:
            # Initialize Pinecone
            pinecone.init(
                api_key=config.api_key,
                environment=config.environment
            )
            
            # Get or create the index
            self.index = pinecone.Index(config.index_name)
            logger.info(f"Initialized Pinecone index '{config.index_name}'")
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
            
    async def add_documents(self, documents: List[DocumentSnippet]) -> None:
        """Add documents to the current namespace."""
        if not self.index or not self.namespace:
            raise RuntimeError("No index or namespace selected")
            
        try:
            # Convert documents to Pinecone format
            vectors = []
            for doc in documents:
                if not doc.embedding:
                    raise ValueError(f"Document {doc.id} missing embedding")
                    
                vector = {
                    'id': doc.id,
                    'values': doc.embedding,
                    'metadata': {
                        'content': doc.content,
                        **doc.metadata
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
        filter_dict: Optional[Dict[str, Any]] = None,
        limit: int = 5
    ) -> List[DocumentSnippet]:
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
            
            # Convert Pinecone results to DocumentSnippets
            documents = []
            for match in results.matches:
                doc = DocumentSnippet(
                    id=match.id,
                    content=match.metadata.pop('content'),
                    metadata=match.metadata,
                    embedding=match.values if hasattr(match, 'values') else None
                )
                documents.append(doc)
                
            return documents
        except Exception as e:
            logger.error(f"Failed to search documents: {str(e)}")
            raise
            
    def is_available(self) -> bool:
        """Check if the database is available for use."""
        return self.index is not None and self.namespace is not None

    async def get_context_type(self) -> ContextType:
        """Get the current context type."""
        return ContextType.SHARED 