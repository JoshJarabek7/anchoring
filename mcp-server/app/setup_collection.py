#!/usr/bin/env python
"""
Setup Collection Script

This script creates a ChromaDB collection with optimal settings for maximum accuracy.
It's designed to be run independently of the main server to initialize or reset the collection.

Usage:
    python setup_collection.py
"""

import os
import asyncio
import logging
from typing import Optional
from dotenv import load_dotenv
from chromadb import AsyncHttpClient

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger("setup-collection")

# Configuration from server.py
CHROMADB_HOST = os.environ.get("CHROMADB_HOST", "localhost")
CHROMADB_PORT = int(os.environ.get("CHROMADB_PORT", "8001"))
COLLECTION_NAME = "documentation_snippets"

# HNSW parameters for maximum accuracy
COLLECTION_METADATA = {
    "hnsw:space": "cosine",           # Cosine distance for text embeddings
    "hnsw:construction_ef": 1000,     # Extremely high for maximum index quality (default: 100)
    "hnsw:M": 128,                    # Very high connectivity (default: 16)
    "hnsw:search_ef": 500,            # Exhaustive search exploration (default: 10)
    "hnsw:num_threads": 16,           # High parallelism for construction
    "hnsw:resize_factor": 1.2,        # Standard resize factor
    "hnsw:batch_size": 500,           # Larger batch size for better indexing
    "hnsw:sync_threshold": 2000       # Higher threshold for fewer disk syncs
}

async def setup_collection(reset: bool = False) -> Optional[str]:
    """
    Set up the ChromaDB collection with maximum accuracy settings.
    
    Args:
        reset: If True, delete and recreate the collection if it exists
        
    Returns:
        Collection ID as string if successful, None if failed
    """
    try:
        logger.info(f"Connecting to ChromaDB at {CHROMADB_HOST}:{CHROMADB_PORT}")
        client = await AsyncHttpClient(
            host=CHROMADB_HOST,
            port=CHROMADB_PORT
        )
        
        # Check if collection exists
        collections = await client.list_collections()
        # In ChromaDB 0.6.0+, list_collections returns a list of collection names (strings)
        collection_exists = COLLECTION_NAME in collections
        
        # Handle existing collection based on reset flag
        if collection_exists:
            if reset:
                logger.info(f"Deleting existing collection: {COLLECTION_NAME}")
                await client.delete_collection(COLLECTION_NAME)
                logger.info(f"Collection {COLLECTION_NAME} deleted")
                # Continue to create a new collection
            else:
                logger.info(f"Collection {COLLECTION_NAME} already exists - using existing collection")
                # Get collection to retrieve its ID
                collection = await client.get_collection(COLLECTION_NAME)
                return str(collection.id) if collection.id else "existing"
        
        # Create collection with maximum accuracy settings
        logger.info(f"Creating collection {COLLECTION_NAME} with maximum accuracy settings")
        collection = await client.create_collection(
            name=COLLECTION_NAME,
            metadata=COLLECTION_METADATA
        )
        
        logger.info(f"Collection created successfully: {COLLECTION_NAME}")
        logger.info("HNSW Parameters:")
        for key, value in COLLECTION_METADATA.items():
            logger.info(f"  {key}: {value}")
            
        return str(collection.id) if collection.id else None
        
    except Exception as e:
        logger.error(f"Error setting up collection: {str(e)}")
        return None

async def main():
    """Main entry point for the script."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Set up ChromaDB collection with maximum accuracy settings")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate the collection if it exists")
    args = parser.parse_args()
    
    result = await setup_collection(reset=args.reset)
    
    if result:
        if result == "existing":
            logger.info("Using existing collection - no changes made")
        else:
            logger.info("Collection setup completed successfully")
    else:
        logger.error("Collection setup failed")

if __name__ == "__main__":
    asyncio.run(main())