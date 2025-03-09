# Anchoring Desktop Application

This is the desktop application for the Anchoring project, built with Tauri, React and TypeScript.

## Prerequisites

- [Node.js](https://nodejs.org/) - LTS version recommended
- [Rust](https://www.rust-lang.org/tools/install) - Required for Tauri
- MCP Server - Automatically set up by the startup scripts (see main README.md)
- ChromaDB - Automatically started by the startup scripts (see main README.md)

For the easiest setup, use the startup scripts in the root directory (`start.sh` for macOS/Linux or `start.bat` for Windows).

## Setup Instructions

1. Install dependencies:

```bash
npm install
```

2. Configure environment (optional):
   - Copy `.env.EXAMPLE` to `.env` to customize ChromaDB connection:
   ```bash
   cp .env.EXAMPLE .env
   ```
   - Adjust `CHROMA_HOST` and `CHROMA_PORT` as needed

3. Verify the MCP server and ChromaDB are running:
   - Check if ChromaDB container is up: `docker ps`
   - Ensure MCP server is installed with Claude: `mcp list`

4. Run the development environment:

```bash
npm run tauri dev
```

## Usage Guide

For a comprehensive tutorial and walkthrough of the Anchoring Desktop Application, check out this guide:
[Anchoring Desktop Tutorial](https://x.com/mrmidwit/status/1898570762128183730?s=46)

## Building the Application

To create a production build:

```bash
npm run tauri build
```

This will create platform-specific binaries in the `src-tauri/target/release` directory.

## Development Notes

- The application uses ShadCN UI components for the interface
- State management is handled through React hooks
- The Tauri app communicates with the MCP server for document processing and retrieval

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)