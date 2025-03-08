#!/bin/bash
# Startup script for Anchoring project
# Works on macOS and Linux

# Save the absolute path to the script directory at the very beginning
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Script directory: ${SCRIPT_DIR}"

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Function to check if a container is running
container_running() {
  docker ps --filter "name=$1" --format '{{.Names}}' | grep -q "$1"
}

# Check prerequisites
echo "Checking prerequisites..."

# Check for Docker
if ! command_exists docker; then
  echo "Error: Docker is not installed. Please install Docker first."
  exit 1
fi

# Check for Node.js
if ! command_exists node; then
  echo "Error: Node.js is not installed. Please install Node.js first."
  exit 1
fi

# Check for Python
if ! command_exists python3; then
  echo "Error: Python 3 is not installed. Please install Python 3 first."
  exit 1
fi

# Check for pyenv
if command_exists pyenv; then
  echo "Detected pyenv installation. Will use uv to manage Python version."
  PYENV_DETECTED=true
else
  # Check Python version only if not using pyenv
  if command_exists python3; then
    PYTHON_VERSION=$(python3 --version 2>&1 | cut -d ' ' -f 2)
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d '.' -f 1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d '.' -f 2)

    if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
      echo "Warning: System Python version $PYTHON_VERSION is older than 3.10."
      echo "uv will attempt to use or download a compatible version for the virtual environment."
    fi

    if [ "$PYTHON_MAJOR" -gt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 13 ]); then
      echo "Warning: System Python version $PYTHON_VERSION is 3.13 or newer."
      echo "uv will attempt to use or download a compatible version for the virtual environment."
    fi
  fi
fi

# Check for Rust
if ! command_exists rustc; then
  echo "Error: Rust is not installed. Please install Rust first."
  exit 1
fi

# Check for uv
if ! command_exists uv; then
  echo "Error: uv is not installed. Please install uv first."
  exit 1
fi

# Start ChromaDB if not running
echo "Checking ChromaDB container..."
if ! container_running "chroma-server"; then
  echo "Starting ChromaDB container..."
  # Use the absolute script directory path saved at the beginning
  cd "${SCRIPT_DIR}/mcp-server"
  
  # Check if docker-compose.yml exists, if not copy from example
  if [ ! -f "docker-compose.yml" ]; then
    echo "Creating docker-compose.yml from example..."
    cp docker-compose.EXAMPLE.yml docker-compose.yml
    echo "Please edit mcp-server/docker-compose.yml to set your ChromaDB data path."
    echo "Press Enter to continue after editing, or Ctrl+C to exit."
    read -r
  fi
  
  docker-compose up -d --remove-orphans
  cd "${SCRIPT_DIR}"
  echo "ChromaDB container started."
else
  echo "ChromaDB container is already running."
fi

# Use the absolute paths based on the script directory saved at the beginning
PROJECT_ROOT="${SCRIPT_DIR}"
MCP_SERVER_DIR="${PROJECT_ROOT}/mcp-server"
MCP_ENV_FILE="${MCP_SERVER_DIR}/.env"

# Debug output
echo "Project root: ${PROJECT_ROOT}"
echo "MCP server directory: ${MCP_SERVER_DIR}"
echo "MCP env file: ${MCP_ENV_FILE}"

# Return to script directory to ensure consistent paths
cd "${SCRIPT_DIR}"

# Check for .env file in mcp-server
if [ ! -f "$MCP_ENV_FILE" ]; then
  echo "Creating .env file at ${MCP_ENV_FILE}..."
  
  # Make sure we create the file in the right location
  mkdir -p "${MCP_SERVER_DIR}"
  
  # Create .env file with required OpenAI API key for MCP server
  cat > "${MCP_ENV_FILE}" << EOF
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1
CHROMADB_HOST=localhost
CHROMADB_PORT=8001
OPENAI_API_KEY=your_openai_api_key_here
MCP_SERVER_NAME="Version-Pinned Documentation Snippets"
EOF
  echo "Please edit ${MCP_ENV_FILE} to add your OpenAI API key (required for MCP server)."
  echo "Press Enter to continue after editing, or Ctrl+C to exit."
  read -r
fi

# Set up virtual environment for MCP server
echo "Setting up Python virtual environment..."
cd "${MCP_SERVER_DIR}" || { echo "Error: Could not cd to ${MCP_SERVER_DIR}"; exit 1; }
echo "Changed directory to: $(pwd)"

# Create virtual environment using uv if it doesn't exist
if [ ! -d ".venv" ]; then
  echo "Creating virtual environment with Python 3.10-3.12..."
  # Use --python with version constraint to let uv handle finding/downloading the right version
  uv venv --python ">=3.10,<3.13" .venv
  
  # Check if venv creation was successful
  if [ ! -d ".venv" ]; then
    echo "Error: Failed to create virtual environment. Please make sure you have uv installed correctly."
    exit 1
  fi
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# Install dependencies using uv
echo "Installing MCP server dependencies..."
uv add -r requirements.txt

# Install MCP CLI in the virtual environment if needed
if ! command -v mcp &> /dev/null; then
  echo "Installing MCP CLI in virtual environment..."
  uv add "mcp[cli]"
fi

# Check if MCP is installed and register our server
echo "Checking MCP installation..."
if command -v mcp &> /dev/null; then
  # Just install/reinstall the MCP server each time
  echo "Installing MCP server with Claude..."
  mcp install "$(pwd)/app/server.py"
else
  echo "Warning: MCP CLI installation failed. Some features may not work correctly."
fi

# Deactivate the virtual environment
deactivate
cd "${SCRIPT_DIR}"

# Install desktop dependencies if needed
echo "Installing desktop dependencies..."
cd "${PROJECT_ROOT}/desktop"
npm install

# Start the application
echo "Starting Tauri application..."
npm run tauri dev

# We won't reach here until the application is closed
echo "Application closed."

# Clean up containers when the app closes
echo "Cleaning up containers..."
if [ -f "$SCRIPT_DIR/mcp-server/docker-compose.yml" ]; then
    cd "$SCRIPT_DIR/mcp-server"
    docker-compose down --remove-orphans
else
    echo "Warning: docker-compose.yml not found in mcp-server directory"
fi
echo "Cleanup complete."