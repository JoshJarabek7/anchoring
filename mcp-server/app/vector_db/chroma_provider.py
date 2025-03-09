"""ChromaDB implementation of the VectorDBProvider interface."""
from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional

from chromadb import AsyncHttpClient

from . import VectorDBProvider, DBConnectionConfig, DocumentSnippet, ContextType

logger = logging.getLogger(__name__)

class ChromaDBProvider(VectorDBProvider):
    """ChromaDB implementation of the VectorDBProvider interface."""
    
    def __init__(self):
        """Initialize ChromaDB provider."""
        self.client = None
        self.collection = None
        
    async def initialize(self, config: DBConnectionConfig) -> None:
        """Initialize connection to ChromaDB."""
        if config.type != "chromadb":
            raise ValueError(f"Invalid config type {config.type} for ChromaDBProvider")
            
        if not config.host or not config.port:
            raise ValueError("ChromaDB requires host and port configuration")
            
        try:
            self.client = await AsyncHttpClient(
                host=config.host,
                port=config.port
            )
            logger.info(f"Initialized ChromaDB client at {config.host}:{config.port}")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB client: {str(e)}")
            raise
            
    async def get_or_create_collection(self, name: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Get or create a ChromaDB collection."""
        if not self.client:
            raise RuntimeError("ChromaDB client not initialized")
            
        try:
            # Use the same high-performance settings as before
            default_metadata = {
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 1000,
                "hnsw:M": 128,
                "hnsw:search_ef": 500,
                "hnsw:num_threads": 16,
                "hnsw:resize_factor": 1.2,
                "hnsw:batch_size": 500,
                "hnsw:sync_threshold": 2000
            }
            
            # Merge with provided metadata if any
            if metadata:
                default_metadata.update(metadata)
                
            self.collection = await self.client.get_or_create_collection(
                name=name,
                metadata=default_metadata
            )
            logger.info(f"Successfully got/created collection '{name}'")
        except Exception as e:
            logger.error(f"Failed to get/create collection: {str(e)}")
            raise
            
    async def add_documents(self, documents: List[DocumentSnippet]) -> None:
        """Add documents to the current collection."""
        if not self.collection:
            raise RuntimeError("No collection selected")
            
        try:
            # Split documents into ids, embeddings, metadatas, and documents
            ids = [doc.id for doc in documents]
            embeddings = [doc.embedding for doc in documents if doc.embedding is not None]
            metadatas = [doc.metadata for doc in documents]
            contents = [doc.content for doc in documents]
            
            # Only provide embeddings if all documents have them
            if len(embeddings) == len(documents):
                await self.collection.add(
                    ids=ids,
                    embeddings=embeddings,
                    metadatas=metadatas,
                    documents=contents
                )
            else:
                await self.collection.add(
                    ids=ids,
                    metadatas=metadatas,
                    documents=contents
                )
            logger.info(f"Added {len(documents)} documents to collection")
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
        if not self.collection:
            raise RuntimeError("No collection selected")
            
        try:
            results = await self.collection.query(
                query_embeddings=[query_embedding],
                where=filter_dict,
                n_results=limit
            )
            
            # Convert ChromaDB results to DocumentSnippets
            documents = []
            for i in range(len(results['ids'][0])):
                doc = DocumentSnippet(
                    id=results['ids'][0][i],
                    content=results['documents'][0][i],
                    metadata=results['metadatas'][0][i],
                    embedding=results.get('embeddings', [[]])[0][i] if 'embeddings' in results else None
                )
                documents.append(doc)
                
            return documents
        except Exception as e:
            logger.error(f"Failed to search documents: {str(e)}")
            raise
            
    def is_available(self) -> bool:
        """Check if the database is available for use."""
        return self.collection is not None

    async def get_context_type(self) -> ContextType:
        """Get the current context type."""
        return ContextType.LOCAL 