"""Vector database interface layer for Anchoring."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

class ContextType(str, Enum):
    """Type of context for vector database operations."""
    LOCAL = "local"
    SHARED = "shared"

@dataclass
class DocumentSnippet:
    """Standard document structure for vector database operations."""
    id: str
    content: str
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None

@dataclass
class DBConnectionConfig:
    """Configuration for database connections."""
    type: str  # "chromadb" or "pinecone"
    # Pinecone settings
    api_key: Optional[str] = None
    environment: Optional[str] = None
    index_name: Optional[str] = None
    # ChromaDB settings
    host: Optional[str] = None
    port: Optional[int] = None

    @classmethod
    def from_env(cls, db_type: str, env_dict: Dict[str, str]) -> "DBConnectionConfig":
        """Create a configuration from environment variables."""
        if db_type == "chromadb":
            return cls(
                type=db_type,
                host=env_dict.get("CHROMADB_HOST", "localhost"),
                port=int(env_dict.get("CHROMADB_PORT", "8000"))
            )
        elif db_type == "pinecone":
            return cls(
                type=db_type,
                api_key=env_dict.get("PINECONE_API_KEY"),
                environment=env_dict.get("PINECONE_ENVIRONMENT"),
                index_name=env_dict.get("PINECONE_INDEX_NAME")
            )
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

class VectorDBProvider(ABC):
    """Interface for vector database operations."""
    
    @abstractmethod
    async def initialize(self, config: DBConnectionConfig) -> None:
        """Initialize connection to the database."""
        pass
    
    @abstractmethod
    async def get_or_create_collection(self, name: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Get or create a collection with the given name."""
        pass
    
    @abstractmethod
    async def add_documents(self, documents: List[DocumentSnippet]) -> None:
        """Add documents to the current collection."""
        pass
    
    @abstractmethod
    async def search_documents(
        self, 
        query_embedding: List[float], 
        filter_dict: Optional[Dict[str, Any]] = None,
        limit: int = 5
    ) -> List[DocumentSnippet]:
        """Search for documents using the query embedding and optional filters."""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if the database is available for use."""
        pass

    @abstractmethod
    async def get_context_type(self) -> ContextType:
        """Get the current context type (local or shared)."""
        pass

def get_provider(context_type: ContextType, env_dict: Dict[str, str]) -> VectorDBProvider:
    """Factory function to create the appropriate vector database provider."""
    from .chroma_provider import ChromaDBProvider
    from .pinecone_provider import PineconeProvider
    
    provider_type = env_dict.get("CONTEXT_SOURCE", "local")
    if provider_type not in [ContextType.LOCAL, ContextType.SHARED]:
        provider_type = ContextType.LOCAL
        
    if provider_type == ContextType.LOCAL:
        config = DBConnectionConfig.from_env("chromadb", env_dict)
        return ChromaDBProvider()
    else:
        config = DBConnectionConfig.from_env("pinecone", env_dict)
        return PineconeProvider() 