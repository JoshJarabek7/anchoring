# Documentation Snippets MCP Server

This project implements a Model Context Protocol (MCP) server that provides version-pinned documentation snippets to Claude and other MCP-compatible LLMs. It uses ChromaDB in HTTP mode for vector storage and search, with OpenAI embeddings for semantic search capabilities.

## Prerequisites

- Global Python 3.10 through 3.12 (matching the range in pyproject.toml, does not work with Python 3.13)
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver
- [Rust](https://www.rust-lang.org/tools/install) - Required for some dependencies
- [Docker](https://www.docker.com) - For running ChromaDB container
- [MCP CLI](https://docs.anthropic.com/en/docs/agents-and-tools/mcp) - To register the MCP with Claude

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
   PYTHONDONTWRITEBYTECODE=1
   PYTHONUNBUFFERED=1
   CHROMADB_HOST=localhost
   CHROMADB_PORT=8001
   OPENAI_API_KEY=your_openai_api_key_here
   MCP_SERVER_NAME="Version-Pinned Documentation Snippets"
   ```

   Be sure to add your actual OpenAI API key.

### 4. Configure and Start ChromaDB Container

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

4. Verify ChromaDB is running:
   ```bash
   docker ps
   ```

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
