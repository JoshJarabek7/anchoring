# Anchoring

Anchoring is a Tauri-based desktop application that provides version-pinned documentation snippets for developers, using Claude AI and ChromaDB for semantic search capabilities.

## Initial Setup (Required for All Installation Methods)

Before using Anchoring, you must install these prerequisites and set up configuration files:

### Required Prerequisites

- [Node.js](https://nodejs.org/) - For the frontend
- [Python](https://python.org/) 3.10 through 3.12 - For the MCP server
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- [Rust](https://www.rust-lang.org/tools/install) - Required for Tauri and some dependencies
- [Docker](https://www.docker.com) - For running ChromaDB container
- [OpenAI API key](https://platform.openai.com/api-keys) - For generating embeddings

### Required Configuration

These configuration steps are necessary regardless of which installation method you choose:

1. **Set up MCP Server environment**:
   ```bash
   # Navigate to the MCP server directory
   cd /path/to/mcp-server
   
   # Create and configure environment variables
   cp .env.EXAMPLE .env
   # Edit .env and add your OPENAI_API_KEY and other required values
   ```

2. **Set up ChromaDB Docker configuration**:
   ```bash
   # In the MCP server directory
   cp docker-compose.EXAMPLE.yml docker-compose.yml
   
   # Edit docker-compose.yml to update the volume path for ChromaDB data
   # Find and modify this line to specify where ChromaDB data should be stored:
   # volumes:
   #   - /path/to/chromadb/data:/chroma/chroma  # Update this path
   ```

3. **Configure MCP in Your Development Environment**:
   
   The MCP server needs to be configured in applications like Cursor to access the Claude AI capabilities:

   ```
   # For Cursor and other MCP clients, add this command to your MCP settings
   uv run --python >=3.10,<3.13 --with chromadb --with mcp[cli] --with numpy --with openai --with pydantic --with semantic-text-splitter --with tiktoken mcp run /path/to/mcp-server/app/server.py
   ```

   Note: Remove any quotes in the command when adding to Cursor MCP settings, or it will fail.

4. **Set up Desktop App environment** (if needed):
   ```bash
   # Navigate to the desktop directory
   cd /path/to/anchoring/desktop
   cp .env.EXAMPLE .env
   
   # Configure environment variables
   ```

## Installation Options

After completing the prerequisites and configuration steps above, you can choose one of these installation methods:

### Option 1: Using the Startup Scripts

We provide convenience scripts that help start the application:

**On macOS/Linux:**
```bash
./start.sh
```

**On Windows:**
```bash
start.bat
```

### Option 2: Manual Setup and Execution

If you prefer to set up and run the application manually, follow these additional steps:

#### 1. Start the ChromaDB Container

```bash
# In the MCP server directory
cd /path/to/mcp-server
docker-compose up -d

# Verify ChromaDB is running
docker ps
```

#### 2. Install the MCP Server with Claude

```bash
# From the project root directory
uv run --python ">=3.10,<3.13" --with chromadb --with "mcp[cli]" --with numpy --with openai --with pydantic --with semantic-text-splitter --with tiktoken mcp install "/path/to/anchoring/mcp-server/app/server.py"
```

#### 3. Set Up the Desktop Application

```bash
# Navigate to the desktop directory
cd /path/to/anchoring/desktop

# Install NPM dependencies
npm install
```

## Running the Application

### 1. Ensure ChromaDB is Running

```bash
# Check if ChromaDB container is running
docker ps

# If not running, start it
cd mcp-server
docker-compose up -d
```

### 2. Start the Tauri Development Environment

```bash
# From the desktop directory
cd desktop
npm run tauri dev
```

## MCP Server Capabilities

The MCP server provides two main tools for Claude and other compatible LLMs:

1. `list-documentation-components` - Lists available documentation components for a category (language, framework, or library)
2. `query-documentation-snippets` - Searches for documentation snippets based on natural language queries

## Using the Application

Once the application is running, you can:

1. Use the crawler to fetch documentation
2. Search for documentation snippets using natural language queries
3. Save and organize knowledge bases

## Using the MCP without running the Application

Once you've crawled and processed your URLs and snippets within the desktop application, you no longer need to have the application running.
However, the docker-compose file in mcp-server needs to be up-and-running in order for Cursor or Claude to query documentation snippets.

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
3. Look for any rate limit messages in the error logs

### Python Version Issues

If you encounter Python version compatibility issues:

1. Check your Python version: `python --version`
2. Ensure it matches the range required (3.10-3.12) - Python 3.13 is not supported
3. Consider using a tool like pyenv to install a compatible Python version
4. uv should automatically search for installed versions within the accepted range, and if not, install them for you.

### MCP Not Found in Claude

If Claude can't see your MCP:

1. Make sure the docker-compose container is running.
2. Verify it was properly registered with `mcp install` command from above.
3. Check the MCP list in Claude Desktop's developer settings
4. Quit the Claude Desktop app and reopen. There's no refresh or reload button for MCP servers in the app and restarting it is required.

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
   ```bash
   # On MacOS
   rm ~/Library/Application\ Support/com.gawntlet.anchoring/anchoring.db
   
   # On Windows
   del %APPDATA%\com.gawntlet.anchoring\anchoring.db
   # or using PowerShell
   Remove-Item "$env:APPDATA\com.gawntlet.anchoring\anchoring.db"
   
   # On Linux
   rm ~/.local/share/com.gawntlet.anchoring/anchoring.db
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

### Additional Troubleshooting

If you encounter any issues:

1. Ensure ChromaDB is running: `docker ps` should show the ChromaDB container
2. Check that environment variables are set correctly
3. Look for errors in the terminal where the app is running
4. Try restarting both ChromaDB and the application

## Platform-Specific Troubleshooting

### Windows Issues

If you're experiencing problems running the application on Windows:

1. **Chrome Detection Failure**: The app requires Chrome or Chromium for web scraping. Ensure it's installed in one of these standard locations:
   ```
   C:\Program Files\Google\Chrome\Application\chrome.exe
   C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
   ```

2. **WebView2 Missing**: Make sure Microsoft Edge WebView2 is installed. It's required for Tauri applications on Windows.
   ```
   winget install Microsoft.EdgeWebView2Runtime
   ```

3. **Path Issues**: If using PowerShell, ensure paths don't have unescaped spaces:
   ```powershell
   # Correct
   cd "C:\Path\With Spaces\anchoring"
   # Incorrect
   cd C:\Path\With Spaces\anchoring
   ```

4. **Admin Privileges**: Some operations may require running as Administrator, especially for Docker operations or file access in restricted locations.

5. **File Access Permissions**: If you're getting file access errors, check the `capabilities/default.json` file in `desktop/src-tauri/capabilities/` to ensure it's using platform-independent variables like `$HOME`, `$DATA`, and `$RESOURCE` instead of hardcoded paths.

### Linux Issues

If you're experiencing problems running the application on Linux:

1. **Missing Dependencies**: Ensure all required system dependencies are installed:
   
   **Debian/Ubuntu:**
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
   ```
   
   **Arch:**
   ```bash
   sudo pacman -Sy
   sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg
   ```
   
   **Fedora:**
   ```bash
   sudo dnf check-update
   sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel
   sudo dnf group install "c-development"
   ```

2. **Chrome/Chromium Path**: Ensure Chrome or Chromium is installed in one of the standard locations:
   ```bash
   sudo apt install chromium-browser   # Debian/Ubuntu
   sudo pacman -S chromium            # Arch
   sudo dnf install chromium          # Fedora
   ```

3. **Docker Permissions**: Ensure your user is in the `docker` group to run Docker commands without sudo:
   ```bash
   sudo usermod -aG docker $USER
   # Log out and back in for changes to take effect
   ```

4. **Permission Issues**: If the app can't access files, check permissions:
   ```bash
   # Fix permissions for the ChromaDB directory
   chmod -R 755 ~/.local/share/com.gawntlet.anchoring
   ```

5. **Library Loading Issues**: If you see errors about missing libraries, try installing them:
   ```bash
   sudo ldconfig
   ```

6. **File Access Permissions**: Check the `capabilities/default.json` file in `desktop/src-tauri/capabilities/` to ensure it's using platform-independent variables like `$HOME`, `$DATA`, and `$RESOURCE` instead of hardcoded macOS paths. If you see paths like `/Users/...`, update them to use the appropriate Tauri variables.

### General Platform Issues

1. **Python Version**: Ensure you're using Python 3.10-3.12 (Python 3.13 is not supported)
2. **Node.js Version**: Use a current LTS version of Node.js
3. **Path Issues**: Verify all paths in `.env` files are compatible with your OS
4. **Docker Container**: If ChromaDB container won't start, check for port conflicts
5. **API Keys**: Ensure your OpenAI API key is valid and has sufficient credits