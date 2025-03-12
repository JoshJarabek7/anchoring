@echo off
:: Startup script for Anchoring project
:: Works on Windows

:: Save the absolute path to the script directory at the very beginning
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%" == "\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
echo Script directory: %SCRIPT_DIR%

echo Checking prerequisites...

:: Check for Docker
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Error: Docker is not installed. Please install Docker first.
  exit /b 1
)

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Error: Node.js is not installed. Please install Node.js first.
  exit /b 1
)

:: Check for Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Error: Python is not installed. Please install Python first.
  exit /b 1
)

:: Check Python version (informational only)
for /f "tokens=2" %%I in ('python --version 2^>^&1') do set "PYTHON_VERSION=%%I"
echo Detected Python version: %PYTHON_VERSION%
echo Note: uv will use Python ^>=3.10,^<3.13 for running MCP components regardless of system Python version.

:: Check for Rust
where rustc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Error: Rust is not installed. Please install Rust first.
  exit /b 1
)

:: Check for uv
where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Error: uv is not installed. Please install uv first.
  exit /b 1
)

:: Start ChromaDB if not running
echo Checking ChromaDB container...
docker ps --filter "name=chroma-server" --format "{{.Names}}" | findstr /r "chroma-server" >nul
if %ERRORLEVEL% NEQ 0 (
  echo Starting ChromaDB container...
  cd "%SCRIPT_DIR%\mcp-server"
  
  :: Check if docker-compose.yml exists, if not copy from example
  if not exist "docker-compose.yml" (
    echo Creating docker-compose.yml from example...
    copy docker-compose.EXAMPLE.yml docker-compose.yml
    echo Please edit mcp-server\docker-compose.yml to set your ChromaDB data path.
    echo Press Enter to continue after editing, or Ctrl+C to exit.
    pause
  )
  
  docker-compose up -d --remove-orphans
  cd "%SCRIPT_DIR%"
  echo ChromaDB container started.
) else (
  echo ChromaDB container is already running.
)

:: Use consistent paths based on the script directory saved at the beginning
set "PROJECT_ROOT=%SCRIPT_DIR%"
set "MCP_SERVER_DIR=%PROJECT_ROOT%\mcp-server"
set "MCP_ENV_FILE=%MCP_SERVER_DIR%\.env"

:: Debug output
echo Project root: %PROJECT_ROOT%
echo MCP server directory: %MCP_SERVER_DIR%
echo MCP env file: %MCP_ENV_FILE%

:: Return to script directory for consistency
cd /d "%SCRIPT_DIR%"

:: Create the mcp-server directory if it doesn't exist
if not exist "%MCP_SERVER_DIR%" mkdir "%MCP_SERVER_DIR%"

:: Check for .env file in mcp-server
if not exist "%MCP_ENV_FILE%" (
  echo Creating .env file in %MCP_SERVER_DIR%...
  
  :: Create a basic .env file directly with required OpenAI API key for MCP server
  (
    echo PYTHONDONTWRITEBYTECODE=1
    echo PYTHONUNBUFFERED=1
    echo CHROMADB_HOST=localhost
    echo CHROMADB_PORT=8001
    echo OPENAI_API_KEY=your_openai_api_key_here
    echo MCP_SERVER_NAME="Version-Pinned Documentation Snippets"
  ) > "%MCP_ENV_FILE%"
  
  echo Please edit %MCP_ENV_FILE% to add your OpenAI API key (required for MCP server).
  echo Press Enter to continue after editing, or Ctrl+C to exit.
  pause
)

:: Install MCP server with uv run
echo Setting up MCP server with Claude...

:: Run setup_collection.py with uv run (commented out)
:: uv run --python ">=3.10,<3.13" --with chromadb --with mcp[cli] --with numpy --with openai --with pydantic --with semantic-text-splitter --with tiktoken python "%MCP_SERVER_DIR%\app\setup_collection.py"

:: Install MCP server
uv run --python ">=3.10,<3.13" --with chromadb --with mcp[cli] --with numpy --with openai --with pydantic --with semantic-text-splitter --with tiktoken mcp install "%MCP_SERVER_DIR%\app\server.py"

:: Install desktop dependencies if needed
echo Installing desktop dependencies...
cd "%PROJECT_ROOT%\desktop"
call npm install

:: Start the application
echo Starting Tauri application...
call npm run tauri dev

:: We won't reach here until the application is closed
echo Application closed.

:: Clean up containers when the app closes
echo Cleaning up containers...
cd "%SCRIPT_DIR%\mcp-server"
:: Stop containers but preserve volumes (to keep ChromaDB data)
docker-compose down --remove-orphans
echo Cleanup complete.