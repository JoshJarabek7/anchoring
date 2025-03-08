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

:: Check Python version but only as informational
for /f "tokens=2" %%I in ('python --version 2^>^&1') do set "PYTHON_VERSION=%%I"
for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
  set "PYTHON_MAJOR=%%a"
  set "PYTHON_MINOR=%%b"
)

if %PYTHON_MAJOR% LSS 3 (
  echo Warning: System Python version %PYTHON_VERSION% is older than 3.10.
  echo uv will attempt to use or download a compatible version for the virtual environment.
)

if %PYTHON_MAJOR% EQU 3 (
  if %PYTHON_MINOR% LSS 10 (
    echo Warning: System Python version %PYTHON_VERSION% is older than 3.10.
    echo uv will attempt to use or download a compatible version for the virtual environment.
  )
)

if %PYTHON_MAJOR% GTR 3 (
  echo Warning: System Python version %PYTHON_VERSION% is 3.13 or newer.
  echo uv will attempt to use or download a compatible version for the virtual environment.
)

if %PYTHON_MAJOR% EQU 3 (
  if %PYTHON_MINOR% GEQ 13 (
    echo Warning: System Python version %PYTHON_VERSION% is 3.13 or newer.
    echo uv will attempt to use or download a compatible version for the virtual environment.
  )
)

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

:: Set up virtual environment for MCP server
echo Setting up Python virtual environment...
cd mcp-server

:: Create virtual environment using uv if it doesn't exist
if not exist ".venv" (
  echo Creating virtual environment with Python 3.10-3.12...
  uv venv --python ">=3.10,<3.13" .venv
  
  :: Check if venv creation was successful
  if not exist ".venv" (
    echo Error: Failed to create virtual environment. Please make sure you have uv installed correctly.
    exit /b 1
  )
)

:: Activate virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate.bat

:: Install dependencies
echo Installing MCP server dependencies...
uv add -r requirements.txt

:: Install MCP CLI in the virtual environment if needed
where mcp >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Installing MCP CLI in virtual environment...
  uv add "mcp[cli]"
)

:: Check if MCP is installed and register our server
echo Checking MCP installation...
where mcp >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  :: Run setup_collection.py first
  echo Setting up ChromaDB collection...
  python "%CD%\app\setup_collection.py"
  
  :: Then install/reinstall the MCP server
  echo Installing MCP server with Claude...
  mcp install "%CD%\app\server.py"
) else (
  echo Warning: MCP CLI installation failed. Some features may not work correctly.
)

:: Deactivate the virtual environment
call deactivate
cd ..

:: Install desktop dependencies if needed
echo Installing desktop dependencies...
cd desktop
call npm install

:: Start the application
echo Starting Tauri application...
call npm run tauri dev

:: We won't reach here until the application is closed
echo Application closed.

:: Clean up containers when the app closes
echo Cleaning up containers...
cd "%~dp0mcp-server"
:: Stop containers but preserve volumes (to keep ChromaDB data)
docker-compose down --remove-orphans
echo Cleanup complete.