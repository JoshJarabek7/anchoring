# Anchoring

Anchoring is a Tauri-based desktop application that provides version-pinned documentation snippets for developers, using Claude AI and ChromaDB for semantic search capabilities.

## Quick Start

We provide convenient startup scripts that will check prerequisites, start ChromaDB, set up the MCP server, and launch the application:

**On macOS/Linux:**
```bash
./start.sh
```

**On Windows:**
```bash
start.bat
```

The script will guide you through the setup process and prompt you to complete any necessary configuration.

## Prerequisites

- [Node.js](https://nodejs.org/) - For the frontend
- [Python](https://python.org/) 3.10 through 3.12 - For the MCP server
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver
- [Rust](https://www.rust-lang.org/tools/install) - Required for Tauri and some dependencies
- [Docker](https://www.docker.com) - For running ChromaDB container
- [OpenAI API key](https://platform.openai.com/api-keys) - For generating embeddings

Note: The start scripts will automatically:
- Set up a Python virtual environment with a compatible version (3.10-3.12)
- Install dependencies using uv
- Install the MCP CLI in the virtual environment
- Create configuration files from templates if needed

## Manual Installation

### 1. Install Prerequisites

#### Rust
```bash
# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows
# Visit https://www.rust-lang.org/tools/install and download rustup-init.exe
```

#### uv for Python
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Set Up the MCP Server

```bash
# Navigate to the MCP server directory
cd mcp-server

# Install dependencies using uv
uv add -r requirements.txt

# Configure environment variables
cp .env.EXAMPLE .env
# Edit .env and add your OpenAI API key
```

### 3. Configure and Start ChromaDB Container

```bash
# Copy the example docker compose file
cd mcp-server
cp docker-compose.EXAMPLE.yml docker-compose.yml

# Edit docker-compose.yml to update the volume path for ChromaDB data
# Start the ChromaDB container
docker-compose up -d

# Verify ChromaDB is running
docker ps
```

### 4. Install the MCP Server with Claude

```bash
# From the project root directory
uv run --python ">=3.10,<3.13" --with chromadb --with "mcp[cli]" --with numpy --with openai --with pydantic --with semantic-text-splitter --with tiktoken mcp install "mcp-server/app/server.py"
```

### 5. Set Up the Desktop Application

```bash
# Navigate to the desktop directory
cd ../desktop

# Install NPM dependencies
npm install
```

## Manual Running

### 1. Make sure ChromaDB is running

```bash
# Check if ChromaDB container is running
docker ps

# If not running, start it
cd mcp-server
docker-compose up -d
```

### 2. Add the MCP server to Cursor or other MCP clients by putting this command in your MCP settings

```bash
# For Cursor and other MCP clients, run the server with this command
uv run --python >=3.10,<3.13 --with chromadb --with mcp[cli] --with numpy --with openai --with pydantic --with semantic-text-splitter --with tiktoken mcp run /path/to/mcp-server/app/server.py
```

Make sure there are no quotes in the Cursor MCP command, or else it will fail.

### 3. Start the Tauri development environment

```bash
# From the desktop directory
cd desktop
npm run tauri dev
```

## Using the Application

Once the application is running, you can:

1. Use the crawler to fetch documentation
2. Search for documentation snippets using natural language queries
3. Save and organize knowledge bases

## Troubleshooting

### ChromaDB Connection Issues

If the MCP server can't connect to ChromaDB:

1. Verify the ChromaDB container is running: `docker ps`
2. Check that the CHROMADB_HOST and CHROMADB_PORT in .env match the Docker container
3. Try restarting the ChromaDB container: `docker-compose restart`

### Embedding Generation Errors

If you see errors related to OpenAI embeddings:

1. Verify your OPENAI_API_KEY in .env is valid and has sufficient credits
2. Check internet access to connect to OpenAI's API

### Tauri Development Issues

If you encounter issues with Tauri:

1. Verify Rust is properly installed: `rustc --version`
2. Check that all dependencies are installed: `npm install`
3. Look for error messages in the terminal output

### App Walkthrough Tutorial

For a comprehensive tutorial and walkthrough of the Anchoring Desktop Application, check out this guide:
[Anchoring Desktop Tutorial](https://x.com/mrmidwit/status/1898570762128183730?s=46)

## License

[MIT License](LICENSE)

### Database Migration Note (Important)

This version includes a database migration that removes `chroma_path` from the database schema. The migration will run automatically when you start the application for the first time after updating.

If you're experiencing issues after updating:

1. Make sure your ChromaDB server is running on the port specified in your `.env` files
2. Delete any existing database file if needed:
   ```
   # From the desktop directory
   rm anchoring.db
   ```
3. Restart the application

### Configuration

The application uses environment variables for configuration:

#### Desktop App Environment Variables

- `VITE_CHROMA_HOST`: Host for the ChromaDB server (default: localhost)
- `VITE_CHROMA_PORT`: Port for the ChromaDB server (default: 8001)
- `VITE_OPENAI_API_KEY`: Your OpenAI API key (optional, can be set in UI)

#### MCP Server Environment Variables

- `CHROMADB_HOST`: Host for the ChromaDB server (default: localhost)
- `CHROMADB_PORT`: Port for the ChromaDB server (default: 8001)
- `OPENAI_API_KEY`: Your OpenAI API key
- `MCP_SERVER_NAME`: Name for the MCP server

### Troubleshooting

If you encounter any issues:

1. Ensure ChromaDB is running: `docker ps` should show the ChromaDB container
2. Check that environment variables are set correctly
3. Look for errors in the terminal where the app is running
4. Try restarting both ChromaDB and the application