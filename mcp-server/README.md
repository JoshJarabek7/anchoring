# Documentation Snippets MCP Server

This project implements a Model Context Protocol (MCP) server that provides version-pinned documentation snippets to Claude and other MCP-compatible LLMs. It uses ChromaDB for vector storage and embedding search.

## Prerequisites

- [Docker](https://www.docker.com/get-started/) and Docker Compose
- Python 3.10+
- [uv](https://github.com/astral-sh/uv) for Python package management (recommended)

## Setup Instructions

### 1. Configure Environment Variables

The server requires environment variables for configuration. Follow these steps:

1. Copy the example environment file to create your own:
   ```bash
   cp .env.EXAMPLE .env
   ```

2. Edit the `.env` file and provide your own values:
   ```
   PYTHONDONTWRITEBYTECODE=1
   PYTHONUNBUFFERED=1
   CHROMA_HOST=chromadb
   CHROMA_PORT=8000
   OPENAI_API_KEY=your_openai_api_key_here
   MCP_SERVER_NAME="Version-Pinned Documentation Snippets"
   ```

   Make sure to replace `your_openai_api_key_here` with your actual OpenAI API key.

   **Note about CHROMA_HOST**: If you're running the server and ChromaDB on the same machine but outside Docker, you might need to modify the server code to use "localhost" instead of the Docker service name "chromadb" for connectivity.

### 2. Set Up Python Environment

We recommend using [uv](https://github.com/astral-sh/uv) for managing your Python environment:

1. Install uv if you haven't already:
   ```bash
   pip install uv
   ```

2. Create a virtual environment and install dependencies:
   ```bash
   uv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   uv pip install -r requirements.dev.txt
   ```

   Alternatively, you can use standard pip:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.dev.txt
   ```

### 3. Start ChromaDB

The server relies on ChromaDB for vector storage. **You must start ChromaDB before running the MCP server**:

```bash
docker-compose up -d
```

This will start the ChromaDB service in detached mode. To verify it's running:

```bash
docker ps
```

You should see a container named `mcp-server-chromadb-1` (or similar) running.

### 4. Run the MCP Server

After setting up the environment and starting ChromaDB, you can now run the MCP server:

```bash
python -m app.server
```

Or using the MCP CLI:

```bash
mcp dev app.server.py
```

### 5. Install in Claude Desktop

To use the server with Claude Desktop:

1. Make sure your server is running
2. In the Claude Desktop app, go to Settings > Developer
3. Add a new server
4. Use the command:
   ```
   python -m app.server
   ```
5. Click "Add Server"

## Troubleshooting

### Server Connection Issues

If you see "Server disconnected" errors in Claude Desktop:

1. Verify ChromaDB is running: `docker ps`
2. Check your environment variables in `.env`
3. Make sure your OpenAI API key is valid
4. Ensure the port (default: 8000) is not being used by another application

### ChromaDB Connection Issues

If the server can't connect to ChromaDB:

1. Ensure the ChromaDB container is running
2. Check if you're running the server on the same host as ChromaDB
3. If running ChromaDB in a different environment, update the `CHROMA_HOST` in your `.env` file

### Common Errors and Solutions

#### "nodename nor servname provided, or not known"

This error indicates a DNS resolution issue when connecting to ChromaDB:

```
httpx.ConnectError: [Errno 8] nodename nor servname provided, or not known
ValueError: Could not connect to a Chroma server. Are you sure it is running?
```

**Solution**: 
1. Edit `app/server.py` and change:
   ```python
   chroma_host = os.getenv("CHROMA_HOST", "localhost")
   ```
   to:
   ```python
   chroma_host = "localhost"
   ```
2. Ensure the ChromaDB Docker container is running

#### EmbeddingFunction Signature Error

If you see this error:

```
ValueError: Expected EmbeddingFunction.__call__ to have the following signature: odict_keys(['self', 'input']), got odict_keys(['self', 'args', 'kwargs'])
```

**Solution**:
1. Make sure you're instantiating the embedding function class when creating a collection:
   ```python
   # Correct:
   embedding_function=MyEmbeddingFunction()
   
   # Incorrect:
   embedding_function=MyEmbeddingFunction
   ```
2. Ensure your embedding function class follows the expected signature pattern

## Development

For development, you can run the server in debug mode:

```bash
mcp dev app.server.py
```

This will provide more detailed logs and allow you to interact with the server through the MCP Inspector interface.

## License

[MIT License](LICENSE)
