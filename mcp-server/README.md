# Documentation Snippets MCP Server

This project implements a Model Context Protocol (MCP) server that provides version-pinned documentation snippets to Claude and other MCP-compatible LLMs. It uses ChromaDB in embedded mode for vector storage and embedding search.

## Prerequisites

- Python 3.10+
- [MCP CLI](https://github.com/modelcontextprotocol/python-sdk) (recommended)

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
   CHROMA_PATH=../.chroma
   OPENAI_API_KEY=your_openai_api_key_here
   MCP_SERVER_NAME="Version-Pinned Documentation Snippets"
   ```

   Make sure to replace `your_openai_api_key_here` with your actual OpenAI API key.
   
   Note: The `CHROMA_PATH` variable specifies where ChromaDB will store its data. The default is `../.chroma` (relative to the server directory).

### 2. Set Up Python Environment

#### Option A: Using MCP CLI (Recommended)

If you use the MCP CLI tools like `mcp dev` or `mcp install`, dependencies are automatically handled by the FastMCP server configuration. Simply install the MCP CLI:

```bash
pip install mcp
```

#### Option B: Manual Setup

If you prefer to run the server directly with Python, you'll need to set up a virtual environment and install dependencies manually:

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.dev.txt
   ```

### 3. Run the MCP Server

After setting up the environment, you can run the server:

#### Option A: Using MCP CLI (Recommended)

The MCP CLI automatically handles dependency installation and provides useful developer tools:

```bash
# Run in development mode with inspector interface
mcp dev app/server.py

# OR install the server in Claude Desktop
mcp install app/server.py
```

#### Option B: Direct Python Execution

If you've set up a virtual environment manually:

```bash
# Activate your virtual environment first
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Then run the server
python -m app.server
```

### 4. Install in Claude Desktop

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

1. Verify your environment variables in `.env`
2. Make sure your OpenAI API key is valid
3. Ensure the path specified in CHROMA_PATH exists and is writable

### ChromaDB Connection Issues

The server uses ChromaDB in embedded mode (PersistentClient), so there's no separate server to connect to. If you're having issues:

1. Check that the directory specified in `CHROMA_PATH` exists and is writable
2. Try temporarily using in-memory mode by modifying server.py:
   ```python
   # Change from:
   chroma_client = chromadb.PersistentClient(path=chroma_path)
   # To:
   chroma_client = chromadb.Client()
   ```
3. Ensure you don't have conflicting ChromaDB versions

## Development

For development, you can run the server in debug mode:

```bash
mcp dev app/server.py
```

This will provide more detailed logs and allow you to interact with the server through the MCP Inspector interface.

### About Dependencies

The server is configured with automatic dependency handling through the FastMCP constructor:

```python
mcp = FastMCP("Version-Pinned Documentation Snippets", 
              dependencies=["openai", "pydantic", "chromadb", "tiktoken", "numpy", "python-dotenv"])
```

This means the MCP CLI automatically installs these dependencies when using `mcp dev` or `mcp install`, eliminating the need for manual dependency management when using the MCP CLI tools.

## License

[MIT License](LICENSE)
