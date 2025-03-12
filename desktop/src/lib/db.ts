import Database from '@tauri-apps/plugin-sql';
import { runMigrations } from './migrations';

// Database connection
let db: Database | null = null;

// Initialize database connection
export const initDB = async () => {
  if (db) return db;
  
  try {
    db = await Database.load("sqlite:anchoring.db");
    console.log("Database connection established");
    
    await createTables();
    
    // Run migrations to handle schema changes
    await runMigrations(db);
    
    return db;
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
};

// Create database tables
const createTables = async () => {
  const dbConn = db!;
  
  try {
    // Create tables if they don't exist
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS proxies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        last_used TIMESTAMP,
        status TEXT CHECK(status IN ('active', 'inactive', 'error'))
      )
    `);
    
    // Use the post-migration schema for new installations - without chroma_path
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS crawl_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        version TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'crawled', 'error', 'skipped', 'processed')),
        html TEXT,
        markdown TEXT,
        cleaned_markdown TEXT,
        FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
      )
    `);
    
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS crawl_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        prefix_path TEXT,
        anti_paths TEXT,
        anti_keywords TEXT,
        max_concurrent_requests INTEGER DEFAULT 4,
        unlimited_parallelism INTEGER DEFAULT 0,
        FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
      )
    `);
    
    // Use the post-migration schema for new installations - without chroma_path
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openai_key TEXT,
        language TEXT,
        language_version TEXT,
        framework TEXT,
        framework_version TEXT,
        library TEXT,
        library_version TEXT
      )
    `);
    
    // Add processing_settings table if it doesn't exist
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS processing_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        category TEXT CHECK(category IN ('language', 'framework', 'library')),
        language TEXT,
        language_version TEXT,
        framework TEXT,
        framework_version TEXT,
        library TEXT,
        library_version TEXT,
        FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
      )
    `);
    
    // Add documentation_snippets table if it doesn't exist
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS documentation_snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snippet_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        source_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add vector DB tables
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS vector_db_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        schema TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS vector_db_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pinecone_api_key TEXT,
        pinecone_environment TEXT,
        pinecone_index TEXT
      )
    `);
    
    // Updated to remove reference to vector_db_configurations
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS session_vector_db_mappings (
        session_id INTEGER NOT NULL,
        provider_name TEXT NOT NULL,
        config_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, provider_name),
        FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
      )
    `);
    
    console.log("All database tables created successfully");
  } catch (error) {
    console.error("Error creating tables:", error);
    throw error;
  }
};

// Proxy Types
export interface Proxy {
  id?: number;
  url: string;
  last_used?: string;
  status: 'active' | 'inactive' | 'error';
}

// Session Types
export interface CrawlSession {
  id?: number;
  title: string;
  version?: string;
  created_at?: string;
}

// URL Types
export interface CrawlURL {
  id?: number;
  session_id: number;
  url: string;
  status: 'pending' | 'crawled' | 'error' | 'skipped' | 'processed';
  html?: string;
  markdown?: string;
  cleaned_markdown?: string;
}

// Settings Types
export interface CrawlSettings {
  id?: number;
  session_id: number;
  prefix_path?: string;
  anti_paths?: string;
  anti_keywords?: string;
  max_concurrent_requests?: number;
  unlimited_parallelism?: boolean;
}

// User Settings Types
export interface UserSettings {
  id?: number;
  openai_key?: string;
  // AI processing details
  language?: string;
  language_version?: string;
  framework?: string;
  framework_version?: string;
  library?: string;
  library_version?: string;
}

// Documentation category enum matching MCP server
export enum DocumentationCategory {
  LANGUAGE = "language",
  FRAMEWORK = "framework",
  LIBRARY = "library"
}

// Tech component interface matching MCP server
export interface TechComponent {
  name: string;
  version?: string;
}

// DocumentationSnippet interfaces

// Full documentation snippet for ChromaDB storage and processing
export interface FullDocumentationSnippet {
  id?: number;
  snippet_id: string;
  category: DocumentationCategory;
  language?: string;
  language_version?: string;
  framework?: string;
  framework_version?: string;
  library?: string;
  library_version?: string;
  title: string;
  description: string;
  source_url?: string;
  content: string;
  concepts?: string[];
  created_at?: string;
  score?: number; // Similarity score from vector search
}

// Simplified documentation snippet for SQLite storage (reference table)
export interface DocumentationSnippet {
  id?: number;
  snippet_id: string;
  title: string;
  source_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Vector DB Settings Types
export interface VectorDBSettings {
  id?: number;
  pinecone_api_key?: string;
  pinecone_environment?: string;
  pinecone_index?: string;
}

// Proxy Operations
export const fetchAndSaveProxies = async (proxyUrls: string[]) => {
  const dbConn = await initDB();
  
  try {
    // Clear existing proxies
    await dbConn.execute('DELETE FROM proxies');
    
    // Insert new proxies in batches to improve performance
    const batchSize = 50;
    for (let i = 0; i < proxyUrls.length; i += batchSize) {
      const batch = proxyUrls.slice(i, i + batchSize);
      const placeholders = batch.map(() => '(?, ?)').join(',');
      const values = batch.flatMap(url => [url, 'active']);
      
      await dbConn.execute(
        `INSERT INTO proxies (url, status) VALUES ${placeholders}`,
        values
      );
    }
    
    return getProxies();
  } catch (error) {
    console.error('Error saving proxies:', error);
    throw error;
  }
};

export const getProxies = async () => {
  const dbConn = await initDB();
  try {
    const result = await dbConn.select<Proxy[]>('SELECT * FROM proxies');
    return result;
  } catch (error) {
    console.error('Error fetching proxies:', error);
    throw error;
  }
};

export const getNextProxy = async () => {
  const dbConn = await initDB();
  
  try {
    // Get the oldest used or never used proxy
    const result = await dbConn.select<Proxy[]>(
      'SELECT * FROM proxies WHERE status = "active" ORDER BY last_used NULLS FIRST, id ASC LIMIT 1'
    );
    
    if (result.length === 0) {
      return null;
    }
    
    // Update the last_used timestamp
    const proxy = result[0];
    await dbConn.execute(
      'UPDATE proxies SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
      [proxy.id]
    );
    
    return proxy;
  } catch (error) {
    console.error('Error getting next proxy:', error);
    throw error;
  }
};

export const updateProxyStatus = async (id: number, status: 'active' | 'inactive' | 'error') => {
  const dbConn = await initDB();
  
  try {
    await dbConn.execute(
      'UPDATE proxies SET status = ? WHERE id = ?',
      [status, id]
    );
  } catch (error) {
    console.error('Error updating proxy status:', error);
    throw error;
  }
};

// Session Operations
export const createSession = async (sessionData: CrawlSession) => {
  try {
    console.log("Starting createSession with data:", sessionData);
    const dbConn = await initDB();
    
    console.log("Executing SQL to create session");
    const result = await dbConn.execute(
      'INSERT INTO crawl_sessions (title, version) VALUES (?, ?)',
      [sessionData.title, sessionData.version || '']
    );
    
    console.log("Session created in database, result:", result);
    return {
      ...sessionData,
      id: result.lastInsertId!
    };
  } catch (error) {
    console.error("Error in createSession:", error);
    throw error; // Re-throw so it can be caught by the calling function
  }
};

export const getSessions = async () => {
  const dbConn = await initDB();
  const result = await dbConn.select<CrawlSession[]>(
    'SELECT * FROM crawl_sessions ORDER BY created_at DESC'
  );
  return result;
};

export const getSession = async (id: number) => {
  const dbConn = await initDB();
  const result = await dbConn.select<CrawlSession[]>(
    'SELECT * FROM crawl_sessions WHERE id = ?',
    [id]
  );
  
  if (result.length === 0) {
    return null;
  }
  
  return result[0];
};

export const deleteSession = async (id: number): Promise<boolean> => {
  const dbConn = await initDB();
  
  try {
    // Delete session (cascade will delete related URLs and settings)
    await dbConn.execute(
      'DELETE FROM crawl_sessions WHERE id = ?',
      [id]
    );
    
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
};

export const duplicateSession = async (id: number): Promise<CrawlSession> => {
  try {
    // Get the session to duplicate
    const originalSession = await getSession(id);
    
    if (!originalSession) {
      throw new Error('Session not found');
    }
    
    // Create a copy with "Copy of" prefix
    const newSession = await createSession({
      title: `Copy of ${originalSession.title}`,
      version: originalSession.version
    });
    
    // Get the original crawl settings
    const settings = await getCrawlSettings(id);
    
    // Duplicate the crawl settings
    await saveCrawlSettings({
      session_id: newSession.id!,
      prefix_path: settings.prefix_path,
      anti_paths: settings.anti_paths,
      anti_keywords: settings.anti_keywords
    });
    
    // Return the new session
    return newSession;
  } catch (error) {
    console.error('Error duplicating session:', error);
    throw error;
  }
};

// URL Operations
export const addURL = async (urlData: CrawlURL) => {
  const dbConn = await initDB();
  
  // Check if the URL already exists for this session
  const existingUrls = await dbConn.select<CrawlURL[]>(
    'SELECT * FROM urls WHERE session_id = ? AND url = ?',
    [urlData.session_id, urlData.url]
  );
  
  // If URL already exists, return the existing record instead of creating a duplicate
  if (existingUrls.length > 0) {
    console.log(`URL already exists: ${urlData.url}`);
    return existingUrls[0];
  }
  
  // If URL doesn't exist, insert it
  const result = await dbConn.execute(
    'INSERT INTO urls (session_id, url, status) VALUES (?, ?, ?)',
    [urlData.session_id, urlData.url, urlData.status]
  );
  
  return {
    ...urlData,
    id: result.lastInsertId!
  };
};

export const getURLs = async (sessionId: number, includeContent: boolean = false) => {
  const dbConn = await initDB();
  const columns = includeContent 
    ? '*' 
    : 'id, session_id, url, status';
  const result = await dbConn.select<CrawlURL[]>(
    `SELECT ${columns} FROM urls WHERE session_id = ? ORDER BY url`,
    [sessionId]
  );
  return result;
};

export const getURLByUrl = async (sessionId: number, url: string): Promise<CrawlURL | null> => {
  const dbConn = await initDB();
  const result = await dbConn.select<CrawlURL[]>(
    'SELECT * FROM urls WHERE session_id = ? AND url = ?',
    [sessionId, url]
  );
  
  if (result.length === 0) {
    return null;
  }
  
  return result[0];
};

export const updateURLStatus = async (id: number, status: string) => {
  const dbConn = await initDB();
  
  try {
    await dbConn.execute(
      'UPDATE urls SET status = ? WHERE id = ?',
      [status, id]
    );
    
    return true;
  } catch (error) {
    console.error("Error updating URL status:", error);
    throw error;
  }
};

/**
 * Update URL status by URL string instead of ID
 * This function is used by the vector-db library
 */
export const updateURLStatusByUrl = async (url: string, status: string) => {
  const dbConn = await initDB();
  
  try {
    await dbConn.execute(
      'UPDATE urls SET status = ? WHERE url = ?',
      [status, url]
    );
    
    return true;
  } catch (error) {
    console.error("Error updating URL status by URL:", error);
    throw error;
  }
};

export const updateURLContent = async (id: number, html: string, markdown: string) => {
  const dbConn = await initDB();
  await dbConn.execute(
    'UPDATE urls SET html = ?, markdown = ? WHERE id = ?',
    [html, markdown, id]
  );
};

export const updateURLCleanedMarkdown = async (id: number, cleanedMarkdown: string) => {
  const dbConn = await initDB();
  await dbConn.execute(
    'UPDATE urls SET cleaned_markdown = ? WHERE id = ?',
    [cleanedMarkdown, id]
  );
};

// Crawl Settings Operations
export const saveCrawlSettings = async (settingsData: CrawlSettings) => {
  const dbConn = await initDB();
  
  try {
    console.log("Saving crawler settings:", settingsData);
    
    // Check if settings exist for this session
    const existing = await dbConn.select<CrawlSettings[]>(
      'SELECT * FROM crawl_settings WHERE session_id = ?',
      [settingsData.session_id]
    );
    
    if (existing.length === 0) {
      console.log("Creating new crawler settings for session ID:", settingsData.session_id);
      // Create new settings
      const result = await dbConn.execute(
        'INSERT INTO crawl_settings (session_id, prefix_path, anti_paths, anti_keywords, max_concurrent_requests, unlimited_parallelism) VALUES (?, ?, ?, ?, ?, ?)',
        [
          settingsData.session_id,
          settingsData.prefix_path || '',
          settingsData.anti_paths || '',
          settingsData.anti_keywords || '',
          settingsData.max_concurrent_requests || 4,
          settingsData.unlimited_parallelism ? 1 : 0
        ]
      );
      
      const savedSettings = {
        ...settingsData,
        id: result.lastInsertId!
      };
      console.log("Created new crawler settings:", savedSettings);
      return savedSettings;
    } else {
      console.log("Updating existing crawler settings for session ID:", settingsData.session_id);
      // Update existing settings
      await dbConn.execute(
        'UPDATE crawl_settings SET prefix_path = ?, anti_paths = ?, anti_keywords = ?, max_concurrent_requests = ?, unlimited_parallelism = ? WHERE session_id = ?',
        [
          settingsData.prefix_path || '',
          settingsData.anti_paths || '',
          settingsData.anti_keywords || '',
          settingsData.max_concurrent_requests || 4,
          settingsData.unlimited_parallelism ? 1 : 0,
          settingsData.session_id
        ]
      );
      
      const updatedSettings = {
        ...settingsData,
        id: existing[0].id
      };
      console.log("Updated crawler settings:", updatedSettings);
      return updatedSettings;
    }
  } catch (error) {
    console.error("Error saving crawler settings:", error);
    throw error;
  }
};

export const getCrawlSettings = async (sessionId: number) => {
  const dbConn = await initDB();
  
  try {
    console.log(`Fetching crawler settings for session ID: ${sessionId}`);
    
    const result = await dbConn.select<CrawlSettings[]>(
      'SELECT * FROM crawl_settings WHERE session_id = ?',
      [sessionId]
    );
    
    if (result.length === 0) {
      console.log(`No settings found for session ID: ${sessionId}, returning defaults`);
      return {
        session_id: sessionId,
        prefix_path: '',
        anti_paths: '',
        anti_keywords: ''
      };
    }
    
    console.log(`Found settings for session ID: ${sessionId}`, result[0]);
    return result[0];
  } catch (error) {
    console.error(`Error fetching crawler settings for session ID: ${sessionId}`, error);
    // Return defaults in case of error
    return {
      session_id: sessionId,
      prefix_path: '',
      anti_paths: '',
      anti_keywords: ''
    };
  }
};

// User Settings Operations
export const saveUserSettings = async (settings: UserSettings) => {
  const dbConn = await initDB();
  console.log("Saving user settings:", settings);
  
  // Check if any settings exist
  const existing = await dbConn.select<UserSettings[]>('SELECT * FROM user_settings LIMIT 1');
  console.log("Existing settings:", existing.length ? existing[0] : "None");
  
  if (existing.length === 0) {
    // Create new settings
    console.log("No existing settings found, creating new settings");
    const result = await dbConn.execute(
      'INSERT INTO user_settings (openai_key, language, language_version, framework, framework_version, library, library_version) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        settings.openai_key || '', 
        settings.language || null,
        settings.language_version || null,
        settings.framework || null,
        settings.framework_version || null,
        settings.library || null,
        settings.library_version || null
      ]
    );
    
    console.log("Settings created with ID:", result.lastInsertId!);
    return {
      ...settings,
      id: result.lastInsertId!
    };
  } else {
    // Update existing settings with non-null values
    const updates = [];
    const params = [];
    
    if (settings.openai_key !== undefined) {
      updates.push('openai_key = ?');
      params.push(settings.openai_key);
    }
    
    // Add AI processing fields
    if (settings.language !== undefined) {
      updates.push('language = ?');
      params.push(settings.language || null);
    }
    
    if (settings.language_version !== undefined) {
      updates.push('language_version = ?');
      params.push(settings.language_version || null);
    }
    
    if (settings.framework !== undefined) {
      updates.push('framework = ?');
      params.push(settings.framework || null);
    }
    
    if (settings.framework_version !== undefined) {
      updates.push('framework_version = ?');
      params.push(settings.framework_version || null);
    }
    
    if (settings.library !== undefined) {
      updates.push('library = ?');
      params.push(settings.library || null);
    }
    
    if (settings.library_version !== undefined) {
      updates.push('library_version = ?');
      params.push(settings.library_version || null);
    }
    
    console.log("Updating settings with fields:", updates);
    console.log("Update parameters:", params);
    
    if (updates.length > 0) {
      params.push(existing[0].id);
      const query = `UPDATE user_settings SET ${updates.join(', ')} WHERE id = ?`;
      console.log("Update query:", query);
      
      const result = await dbConn.execute(query, params);
      console.log("Update result:", result);
    } else {
      console.log("No fields to update");
    }
    
    // Get the updated settings to confirm the changes
    const updatedSettings = await getUserSettings();
    console.log("Updated settings:", updatedSettings);
    
    return {
      ...existing[0],
      ...settings,
    };
  }
};

export interface ProcessingSettings {
  session_id: number;
  language?: string;
  language_version?: string;
  framework?: string;
  framework_version?: string;
  library?: string;
  library_version?: string;
  category?: DocumentationCategory;
}

// Get processing settings for a specific session
export const getProcessingSettings = async (sessionId: number): Promise<ProcessingSettings | null> => {
  const dbConn = await initDB();
  console.log(`Fetching processing settings for session ${sessionId}`);
  
  try {
    // First check if the settings table exists
    const tableExists = await dbConn.select<{name: string}[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='processing_settings'"
    );
    
    // If the table doesn't exist, create it
    if (tableExists.length === 0) {
      console.log("Creating processing_settings table");
      await dbConn.execute(`
        CREATE TABLE IF NOT EXISTS processing_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL UNIQUE,
          language TEXT,
          language_version TEXT,
          framework TEXT,
          framework_version TEXT,
          library TEXT,
          library_version TEXT,
          category TEXT,
          FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
        )
      `);
    } else {
      // Check if the category column exists
      const columns = await dbConn.select<{name: string, type: string}[]>(
        "PRAGMA table_info(processing_settings)"
      );
      const columnExists = columns.some((col) => col.name === 'category');
      
      // Add the column if it doesn't exist
      if (!columnExists) {
        console.log("Adding category column to processing_settings table");
        await dbConn.execute(
          "ALTER TABLE processing_settings ADD COLUMN category TEXT"
        );
      }
    }
    
    // Query the settings for this session
    const result = await dbConn.select<ProcessingSettings[]>(
      'SELECT * FROM processing_settings WHERE session_id = ?',
      [sessionId]
    );
    
    if (result.length === 0) {
      console.log(`No processing settings found for session ${sessionId}`);
      return null;
    }
    
    return result[0];
  } catch (error) {
    console.error(`Error fetching processing settings:`, error);
    return null;
  }
};

// Save processing settings for a specific session
export const saveProcessingSettings = async (settings: ProcessingSettings): Promise<void> => {
  const dbConn = await initDB();
  console.log(`Saving processing settings for session ${settings.session_id}:`, settings);
  
  try {
    // Check if settings for this session already exist
    const existing = await dbConn.select<ProcessingSettings[]>(
      'SELECT id FROM processing_settings WHERE session_id = ?',
      [settings.session_id]
    );
    
    if (existing.length === 0) {
      // Create new settings
      console.log(`Creating new processing settings for session ${settings.session_id}`);
      await dbConn.execute(
        'INSERT INTO processing_settings (session_id, language, language_version, framework, framework_version, library, library_version, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          settings.session_id,
          settings.language || null,
          settings.language_version || null,
          settings.framework || null,
          settings.framework_version || null,
          settings.library || null,
          settings.library_version || null,
          settings.category || null
        ]
      );
    } else {
      // Update existing settings
      console.log(`Updating processing settings for session ${settings.session_id}`);
      await dbConn.execute(
        'UPDATE processing_settings SET language = ?, language_version = ?, framework = ?, framework_version = ?, library = ?, library_version = ?, category = ? WHERE session_id = ?',
        [
          settings.language || null,
          settings.language_version || null,
          settings.framework || null,
          settings.framework_version || null,
          settings.library || null,
          settings.library_version || null,
          settings.category || null,
          settings.session_id
        ]
      );
    }
    
  } catch (error) {
    console.error(`Error saving processing settings:`, error);
    throw error;
  }
};

export const getUserSettings = async () => {
  const dbConn = await initDB();
  console.log("Fetching user settings from database");
  const result = await dbConn.select<UserSettings[]>(
    'SELECT id, openai_key, language, language_version, framework, framework_version, library, library_version FROM user_settings LIMIT 1'
  );
  
  if (result.length === 0) {
    const defaultSettings = {
      openai_key: '',
      language: null,
      language_version: null,
      framework: null,
      framework_version: null,
      library: null,
      library_version: null
    };
    console.log("No user settings found, returning defaults:", defaultSettings);
    return defaultSettings;
  }
  
  // Convert explicit null values to empty strings to avoid UI issues
  const settings = {
    ...result[0],
    language: result[0].language || '',
    language_version: result[0].language_version || '',
    framework: result[0].framework || '',
    framework_version: result[0].framework_version || '',
    library: result[0].library || '',
    library_version: result[0].library_version || ''
  };
  
  // Log the settings for debugging
  console.log("Retrieved user settings from database:", settings);
  return settings;
};

// Documentation snippets operations
export const addDocumentationSnippet = async (snippet: DocumentationSnippet): Promise<DocumentationSnippet> => {
  const dbConn = await initDB();
  
  try {
    const result = await dbConn.execute(
      'INSERT INTO documentation_snippets (snippet_id, title, source_url) VALUES (?, ?, ?)',
      [snippet.snippet_id, snippet.title, snippet.source_url || '']
    );
    
    return {
      ...snippet,
      id: result.lastInsertId!,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error adding documentation snippet:', error);
    throw error;
  }
};

export const getDocumentationSnippet = async (snippet_id: string): Promise<DocumentationSnippet | null> => {
  const dbConn = await initDB();
  
  try {
    const result = await dbConn.select<DocumentationSnippet[]>(
      'SELECT * FROM documentation_snippets WHERE snippet_id = ?',
      [snippet_id]
    );
    
    if (result.length === 0) {
      return null;
    }
    
    return result[0];
  } catch (error) {
    console.error('Error getting documentation snippet:', error);
    throw error;
  }
};

export const getDocumentationSnippets = async (): Promise<DocumentationSnippet[]> => {
  const dbConn = await initDB();
  
  try {
    const result = await dbConn.select<DocumentationSnippet[]>(
      'SELECT * FROM documentation_snippets ORDER BY created_at DESC'
    );
    
    return result;
  } catch (error) {
    console.error('Error getting documentation snippets:', error);
    throw error;
  }
};

export const updateDocumentationSnippet = async (snippet: DocumentationSnippet): Promise<DocumentationSnippet> => {
  const dbConn = await initDB();
  
  try {
    await dbConn.execute(
      'UPDATE documentation_snippets SET title = ?, source_url = ?, updated_at = CURRENT_TIMESTAMP WHERE snippet_id = ?',
      [snippet.title, snippet.source_url || '', snippet.snippet_id]
    );
    
    return await getDocumentationSnippet(snippet.snippet_id) as DocumentationSnippet;
  } catch (error) {
    console.error('Error updating documentation snippet:', error);
    throw error;
  }
};

export const deleteDocumentationSnippet = async (snippet_id: string): Promise<boolean> => {
  const dbConn = await initDB();
  
  try {
    await dbConn.execute(
      'DELETE FROM documentation_snippets WHERE snippet_id = ?',
      [snippet_id]
    );
    
    return true;
  } catch (error) {
    console.error('Error deleting documentation snippet:', error);
    throw error;
  }
};

// Clean up duplicate URLs for a session, keeping only one instance of each URL (preferring non-error statuses)
export const cleanupDuplicateURLs = async (sessionId: number): Promise<number> => {
  const db = await initDB();
  
  try {
    // Find URLs that appear more than once
    const duplicates = await db.select<{url: string, count: number}[]>(
      `SELECT url, COUNT(*) as count 
       FROM urls 
       WHERE session_id = ? 
       GROUP BY url 
       HAVING COUNT(*) > 1`,
      [sessionId]
    );
    
    let deletedCount = 0;
    
    // For each duplicated URL, keep the best instance (prioritize processed > crawled > pending > error)
    for (const dup of duplicates) {
      // Get all instances of this URL
      const instances = await db.select<CrawlURL[]>(
        `SELECT * FROM urls WHERE session_id = ? AND url = ? ORDER BY 
         CASE status
           WHEN 'processed' THEN 1
           WHEN 'crawled' THEN 2
           WHEN 'pending' THEN 3
           WHEN 'error' THEN 4
           ELSE 5
         END ASC, id ASC`,
        [sessionId, dup.url]
      );
      
      // Keep the first one (best status), delete the rest
      if (instances.length > 1) {
        console.log(`Found ${instances.length} duplicates of URL: ${dup.url}, keeping best version with status: ${instances[0].status}`);
        
        const idsToDelete = instances.slice(1).map(u => u.id);
        const placeholders = idsToDelete.map(() => '?').join(',');
        
        // Delete duplicates
        await db.execute(
          `DELETE FROM urls WHERE id IN (${placeholders})`,
          [...idsToDelete]
        );
        
        deletedCount += idsToDelete.length;
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error("Error cleaning up duplicate URLs:", error);
    throw error;
  }
};

// Delete all URLs for a session
export const deleteAllURLs = async (sessionId: number): Promise<number> => {
  try {
    const dbConn = await initDB();
    
    const result = await dbConn.execute(
      `DELETE FROM urls WHERE session_id = $1`,
      [sessionId]
    );
    
    return result.rowsAffected;
  } catch (error) {
    console.error("Error deleting all URLs:", error);
    throw error;
  }
};

/**
 * Filter URLs based on anti-patterns
 * Returns the list of URLs that match the anti-patterns (to be deleted)
 */
export const getURLsMatchingAntiPatterns = async (
  sessionId: number, 
  antiPaths: string[], 
  antiKeywords: string[]
): Promise<CrawlURL[]> => {
  try {
    await initDB();
    
    // Get all URLs for the session (just metadata, no content needed)
    const urls = await getURLs(sessionId, false);
    
    // Filter URLs that match anti-patterns
    return urls.filter(url => {
      // Check if URL contains any anti-paths
      if (antiPaths.some(path => url.url.includes(path))) {
        return true;
      }
      
      // Check if URL contains any anti-keywords
      if (antiKeywords.some(keyword => url.url.includes(keyword))) {
        return true;
      }
      
      return false;
    });
  } catch (error) {
    console.error("Error getting URLs matching anti-patterns:", error);
    throw error;
  }
};

/**
 * Delete URLs that match anti-patterns
 * Returns the number of URLs deleted
 */
export const deleteURLsMatchingAntiPatterns = async (
  sessionId: number, 
  antiPaths: string[], 
  antiKeywords: string[]
): Promise<number> => {
  const db = await initDB();
  
  try {
    // Get the URLs that match the anti-patterns
    const urlsToDelete = await getURLsMatchingAntiPatterns(sessionId, antiPaths, antiKeywords);
    
    if (urlsToDelete.length === 0) {
      return 0;
    }
    
    // Delete the URLs
    const result = await db.execute(
      `DELETE FROM urls WHERE session_id = ? AND url IN (${urlsToDelete.map(() => '?').join(',')})`,
      [sessionId, ...urlsToDelete.map(url => url.url)]
    );
    
    return urlsToDelete.length;
  } catch (error) {
    console.error("Error deleting URLs matching anti-patterns:", error);
    throw error;
  }
};

/**
 * Export a session and all its associated data (URLs, settings) as a JSON object
 */
export const exportSession = async (id: number): Promise<any> => {
  await initDB();
  
  try {
    // Fetch all data related to this session
    const session = await getSession(id);
    if (!session) {
      throw new Error(`Session with ID ${id} not found`);
    }
    
    // Get settings for this session
    const settings = await getCrawlSettings(id);
    
    // Get URLs for this session (without HTML/markdown content)
    const urls = await getURLs(id, false);
    
    // Build export object
    const exportData = {
      session: {
        title: session.title,
        version: session.version,
        created_at: session.created_at
      },
      settings: settings,
      urls: urls
    };
    
    return exportData;
  } catch (error) {
    console.error("Error exporting session:", error);
    throw error;
  }
};

/**
 * Import a session from a JSON object
 */
export const importSession = async (importData: any): Promise<CrawlSession> => {
  await initDB();
  
  try {
    // Validate import data
    if (!importData.session || !importData.session.title) {
      throw new Error("Invalid import data: session title is required");
    }
    
    // Create new session
    const sessionData = {
      title: importData.session.title,
      version: importData.session.version
    };
    
    const newSession = await createSession(sessionData);
    
    // Create settings if available
    if (importData.settings) {
      const settingsData = {
        session_id: newSession.id!,
        prefix_path: importData.settings.prefix_path,
        anti_paths: importData.settings.anti_paths,
        anti_keywords: importData.settings.anti_keywords
      };
      
      await saveCrawlSettings(settingsData);
    }
    
    // Import URLs if available
    if (importData.urls && Array.isArray(importData.urls)) {
      for (const urlData of importData.urls) {
        await addURL({
          session_id: newSession.id!,
          url: urlData.url,
          status: urlData.status,
          html: urlData.html,
          markdown: urlData.markdown,
          cleaned_markdown: urlData.cleaned_markdown
        });
      }
    }
    
    return newSession;
  } catch (error) {
    console.error("Error importing session:", error);
    throw error;
  }
};

// Vector DB Settings Operations
export const saveVectorDBSettings = async (settings: VectorDBSettings) => {
  const dbConn = await initDB();
  
  // Check if any settings exist
  const existing = await dbConn.select<VectorDBSettings[]>('SELECT * FROM vector_db_settings LIMIT 1');
  
  if (existing.length === 0) {
    // Create new settings
    console.log("No existing vector DB settings found, creating new settings");
    const result = await dbConn.execute(
      'INSERT INTO vector_db_settings (pinecone_api_key, pinecone_environment, pinecone_index) VALUES (?, ?, ?)',
      [
        settings.pinecone_api_key || '', 
        settings.pinecone_environment || '',
        settings.pinecone_index || ''
      ]
    );
    
    console.log("Vector DB settings created with ID:", result.lastInsertId!);
    return {
      ...settings,
      id: result.lastInsertId!
    };
  }

  // Update existing settings with non-null values
  const updates = [];
  const params = [];
  
  if (settings.pinecone_api_key !== undefined) {
    updates.push('pinecone_api_key = ?');
    params.push(settings.pinecone_api_key);
  }
  
  if (settings.pinecone_environment !== undefined) {
    updates.push('pinecone_environment = ?');
    params.push(settings.pinecone_environment);
  }
  
  if (settings.pinecone_index !== undefined) {
    updates.push('pinecone_index = ?');
    params.push(settings.pinecone_index);
  }
  
  if (updates.length > 0) {
    params.push(existing[0].id);
    const query = `UPDATE vector_db_settings SET ${updates.join(', ')} WHERE id = ?`;
    console.log("Update query:", query);
    
    const result = await dbConn.execute(query, params);
    console.log("Update result:", result);
  } else {
    console.log("No fields to update");
  }
  
  return {
    ...existing[0],
    ...settings,
  };
};

export const getVectorDBSettings = async () => {
  const dbConn = await initDB();
  console.log("Fetching vector DB settings from database");
  const result = await dbConn.select<VectorDBSettings[]>(
    'SELECT id, pinecone_api_key, pinecone_environment, pinecone_index FROM vector_db_settings LIMIT 1'
  );
  
  if (result.length === 0) {
    const defaultSettings = {
      pinecone_api_key: '',
      pinecone_environment: '',
      pinecone_index: ''
    };
    console.log("No vector DB settings found, returning defaults:", defaultSettings);
    return defaultSettings;
  }
  
  const settings = {
    ...result[0],
    pinecone_api_key: result[0].pinecone_api_key || '',
    pinecone_environment: result[0].pinecone_environment || '',
    pinecone_index: result[0].pinecone_index || ''
  };
  
  return settings;
};

// Add new interfaces and functions for the new system
export interface VectorDBProvider {
  id: number;
  name: string;
  version: string;
  schema: Record<string, any>;
  created_at: string;
}

export interface SessionVectorDBMapping {
  session_id: number;
  provider_name: string;
  config_data: string;
  created_at?: string;
}

export const getVectorDBProviders = async (): Promise<VectorDBProvider[]> => {
  const dbConn = await initDB();
  
  try {
    const result = await dbConn.select<VectorDBProvider[]>(
      'SELECT * FROM vector_db_providers'
    );
    
    return result.map(provider => ({
      ...provider,
      schema: JSON.parse(provider.schema as unknown as string)
    }));
  } catch (error) {
    console.error('Error getting vector DB providers:', error);
    throw error;
  }
};

/**
 * Save the vector DB provider mapping for a session
 * @param mapping The session-vector DB mapping to save
 * @returns The saved mapping
 */
export const saveSessionVectorDBMapping = async (mapping: SessionVectorDBMapping): Promise<SessionVectorDBMapping> => {
  try {
    const dbConn = await initDB();
    
    // Check if mapping already exists
    const existingMapping = await dbConn.select<SessionVectorDBMapping[]>(
      'SELECT * FROM session_vector_db_mappings WHERE session_id = ? AND provider_name = ?',
      [mapping.session_id, mapping.provider_name]
    );
    
    if (existingMapping.length > 0) {
      // Update existing mapping;
      await dbConn.execute(
        'UPDATE session_vector_db_mappings SET config_data = ? WHERE session_id = ? AND provider_name = ?',
        [mapping.config_data, mapping.session_id, mapping.provider_name]
      );
    } else {
      // Create new mapping
      await dbConn.execute(
        'INSERT INTO session_vector_db_mappings (session_id, provider_name, config_data) VALUES (?, ?, ?)',
        [mapping.session_id, mapping.provider_name, mapping.config_data]
      );
    }
    
    return mapping;
  } catch (error) {
    console.error("Error saving session vector DB mapping:", error);
    throw error;
  }
};

/**
 * Get the vector DB provider mapping for a session
 * @param sessionId The session ID
 * @returns The session-vector DB mapping or null if not found
 */
export const getSessionVectorDBMapping = async (sessionId: number): Promise<SessionVectorDBMapping | null> => {
  try {
    const dbConn = await initDB();
    
    const mappings = await dbConn.select<SessionVectorDBMapping[]>(
      'SELECT * FROM session_vector_db_mappings WHERE session_id = ?',
      [sessionId]
    );
    
    if (mappings.length === 0) {
      console.log("No vector DB mapping found for session:", sessionId);
      return null;
    }
    
    return mappings[0];
  } catch (error) {
    console.error("Error getting session vector DB mapping:", error);
    throw error;
  }
};