# Anchoring Desktop - TODO List

## Frontend Implementation

### Setup & Configuration
- [x] Implement ChromaDB path validation (using fs-extra plugin)
- [x] Create database initialization on the frontend
- [x] Add persistent settings storage (remember ChromaDB path)
- [x] Add dark/light theme toggle using ShadCN's ThemeProvider
- [x] Fix React ref warnings in ShadCN components

### Session Management
- [x] Implement session creation form
- [x] Implement session listing UI
- [x] Add session selection capability
- [x] Add session deletion functionality
- [x] Add session duplication functionality
- [x] Implement session export/import

### Crawler UI
- [x] Create basic crawler configuration form
- [x] Implement URL management interface
- [x] Create URL discovery progress indicators
- [x] Add real-time URL filtering capabilities
- [x] Implement batch URL operations (select all matching filter)
- [x] Create detailed URL view modal
- [x] Add error handling and retry mechanisms
- [ ] Implement crawl history and logs

### Proxy Management
- [x] Implement proxy fetching from remote source
- [x] Create proxy listing UI
- [x] Add proxy status indicators (working/failed)
- [ ] Implement proxy usage statistics

### Processing Pipeline
- [x] Implement OpenAI API key management
- [x] Create HTML to Markdown conversion using Turndown
- [ ] Build markdown preview functionality
- [x] Implement GPT-4o-mini cleanup integration
- [x] Add chunking controls and preview
- [x] Implement ChromaDB integration
- [x] Create embedding progress indicators
- [x] Add error handling for API failures

### Documentation Management
- [x] Implement documentation snippet viewing
- [ ] Create tech stack filtering (language/framework/library)
- [ ] Add documentation search functionality
- [ ] Implement documentation export/import
- [ ] Create version comparison tools

## Backend Implementation

### Tauri Commands
- [x] Implement proxy fetching
- [x] Implement file system operations for ChromaDB

## Documentation
- [ ] Update README with installation instructions
- [ ] Create user documentation
- [ ] Add developer documentation
- [ ] Document API endpoints and data structures