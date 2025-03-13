# Documentation Snippets MCP Server

This project implements a Model Context Protocol (MCP) server that provides version-pinned documentation snippets to Claude and other MCP-compatible LLMs. It supports both local storage using ChromaDB and shared storage using Pinecone for vector storage and search, with OpenAI embeddings for semantic search capabilities.

## Prerequisites

- Global Python 3.10 through 3.12 (matching the range in pyproject.toml, does not work with Python 3.13)
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver
- [Rust](https://www.rust-lang.org/tools/install) - Required for some dependencies
- [Docker](https://www.docker.com) - For running ChromaDB container (only needed for local context)
- [MCP CLI](https://docs.anthropic.com/en/docs/agents-and-tools/mcp) - To register the MCP with Claude
- [Pinecone Account](https://www.pinecone.io) - For shared context (optional)

## Setup Instructions

### 1. Install uv and Rust

If you don't have Rust installed:

```bash
# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows
# Visit https://www.rust-lang.org/tools/install and download rustup-init.exe
```

Install uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Clone the Repository and Install Dependencies

```bash
# Clone the anchoring repository (if you haven't already)
git clone <repository-url>
cd anchoring

# Install dependencies using uv
cd mcp-server
uv add -r requirements.txt
```

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.EXAMPLE .env
   ```

2. Edit the `.env` file with your settings:
   ```
   # Required settings
   PYTHONDONTWRITEBYTECODE=1
   PYTHONUNBUFFERED=1
   OPENAI_API_KEY=your_openai_api_key_here
   MCP_SERVER_NAME="Version-Pinned Documentation Snippets"

   # Context source control (local or shared)
   CONTEXT_SOURCE=local

   # Local ChromaDB settings (required for local context)
   CHROMADB_HOST=localhost
   CHROMADB_PORT=8001

   # Pinecone settings (required for shared context)
   PINECONE_API_KEY=your_pinecone_api_key_here
   PINECONE_ENVIRONMENT=your_pinecone_environment_here
   PINECONE_INDEX_NAME=your_pinecone_index_name_here
   ```

   Be sure to add your actual OpenAI API key and, if using shared context, your Pinecone credentials.

### 4. Configure Storage Backend

#### Local Context (ChromaDB)

If using local context (default):

1. Copy the example docker compose file:
   ```bash
   cp docker-compose.EXAMPLE.yml docker-compose.yml
   ```

2. Review the `docker-compose.yml` file and update the path where ChromaDB will store data:
   ```yaml
   volumes:
     - /path/to/chromadb/data:/chroma/chroma  # Update this path
   ```

3. Start the ChromaDB container:
   ```bash
   docker-compose up -d
   ```

#### Shared Context (Pinecone)

If using shared context:

1. Create a Pinecone account at https://www.pinecone.io if you haven't already
2. Create a new index with the following settings:
   - Dimensions: 3072 (for OpenAI's text-embedding-3-large model)
   - Metric: Cosine
   - Pod Type: Starter (or higher based on your needs)
3. Copy your API key, environment, and index name to the `.env` file

### 5. Install and Run the MCP Server

Install the MCP server with Claude Desktop:

```bash
mcp install app/server.py
```

### 6. Using the MCP with Cursor

To use the MCP with Cursor:

```bash
# Replace with your actual path
uv run --with chromadb --with mcp[cli] --with numpy --with openai --with pydantic --with tiktoken mcp run /path/to/your/anchoring/mcp-server/app/server.py
```

## Usage

### Context Switching

The server supports two types of context:

1. **Local Context** (default) - Uses ChromaDB for single-user local storage
2. **Shared Context** - Uses Pinecone for multi-user shared storage

Available commands:

```bash
# Show current context
show context source

# View sample contents from current context
show context contents

# Switch to local context
use local context

# Switch to shared context
use shared context
```

You can also set the default context in your `.env` file:
```bash
CONTEXT_SOURCE=local  # or 'shared'
```

Example workflow:

```bash
# 1. Check current context
show context source
# Output: Current context: local

# 2. View what's in the local database
show context contents
# Output: Sample contents from local context...

# 3. Switch to shared context
use shared context
# Output: Successfully switched to shared context

# 4. Verify the switch worked
show context source
# Output: Current context: shared

# 5. Compare contents to confirm different database
show context contents
# Output: Sample contents from shared context...
```

This allows you to verify that you're connected to the correct database and see what kind of documentation is available in each context.

Once the MCP is running, you can use it with Claude to retrieve documentation snippets. The MCP provides two main tools:

1. `list-documentation-components` - Lists available components for a category (language, framework, or library)
2. `query-documentation-snippets` - Searches for documentation snippets based on queries

Example query in Claude:

```
I need to understand how to create a Tauri application. Can you show me documentation?
```

## Troubleshooting

### ChromaDB Connection Issues

If the MCP server can't connect to ChromaDB:

1. Verify the ChromaDB container is running: `docker ps`
2. Check that the CHROMADB_HOST and CHROMADB_PORT in .env match the Docker container
3. Make sure there are no firewall or network issues blocking the connection
4. Try restarting the ChromaDB container: `docker-compose restart`

### Pinecone Connection Issues

If you have trouble connecting to Pinecone:

1. Verify your Pinecone credentials in .env:
   - PINECONE_API_KEY is set and valid
   - PINECONE_ENVIRONMENT matches your index's environment
   - PINECONE_INDEX_NAME matches exactly (case sensitive)
2. Check your index configuration:
   - Dimensions should be 3072 for text-embedding-3-large
   - Metric should be Cosine
3. Common error messages:
   - "API key not found" - Check PINECONE_API_KEY
   - "Index not found" - Verify PINECONE_INDEX_NAME and PINECONE_ENVIRONMENT
   - "Dimension mismatch" - Recreate index with 3072 dimensions

### Context Switching Issues

If you have trouble switching contexts:

1. When switching to local context:
   - Ensure ChromaDB is running
   - Check docker logs for any ChromaDB errors
   - Verify port 8001 is not blocked
2. When switching to shared context:
   - Check all Pinecone environment variables are set
   - Verify your Pinecone service is active
   - Check your API key has access to the index
3. To verify a switch worked:
   - Use `show context source` to confirm the switch
   - Use `show context contents` to verify different contents
   - Check logs for any connection errors

### Embedding Generation Errors

If you see errors related to OpenAI embeddings:

1. Verify your OPENAI_API_KEY in .env is valid and has sufficient credits
2. Check that you have internet access to connect to OpenAI's API
3. Look for any rate limit messages in the error logs

### Python Version Issues

If you encounter Python version compatibility issues:

1. Check your Python version: `python --version`
2. Ensure it matches the range specified in pyproject.toml
3. Consider using a tool like pyenv to install a compatible Python version

### MCP Not Found in Claude

If Claude can't see your MCP:

1. Make sure the MCP server is running
2. Verify it was properly registered with `mcp install`
3. Check the MCP list in Claude Desktop's developer settings

## Development Notes

- The server uses ChromaDB in HTTP mode, communicating with a separate ChromaDB container
- Embeddings are generated using OpenAI's text-embedding-3-large model
- Queries are matched using both semantic similarity and metadata filtering

## License

[MIT License](LICENSE)
