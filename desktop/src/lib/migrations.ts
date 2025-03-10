import Database from '@tauri-apps/plugin-sql';

/**
 * Run database migrations to ensure schema is up to date
 * @param dbConn Database connection
 */
export const runMigrations = async (dbConn: Database) => {
  console.log("Running database migrations...");
  
  try {
    // Create migrations table if it doesn't exist
    await dbConn.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get list of applied migrations
    const appliedMigrations = await dbConn.select<{ name: string }[]>(
      'SELECT name FROM migrations'
    );
    const appliedMigrationNames = appliedMigrations.map(m => m.name);
    
    // Define migrations
    const migrations = [
      {
        name: 'remove_chroma_path',
        up: async () => {
          console.log("Running migration: remove_chroma_path");
          
          // Check if columns exist before trying to remove them
          try {
            // Get column info to check if chroma_path exists in crawl_sessions
            const sessionColumns = await dbConn.select<{ name: string }[]>(
              "PRAGMA table_info(crawl_sessions)"
            );
            
            if (sessionColumns.some(col => col.name === 'chroma_path')) {
              // Create a new table without chroma_path
              await dbConn.execute(`
                CREATE TABLE crawl_sessions_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  title TEXT NOT NULL,
                  version TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
              `);
              
              // Copy data excluding chroma_path
              await dbConn.execute(`
                INSERT INTO crawl_sessions_new (id, title, version, created_at)
                SELECT id, title, version, created_at FROM crawl_sessions;
              `);
              
              // Drop old table and rename new one
              await dbConn.execute(`DROP TABLE crawl_sessions;`);
              await dbConn.execute(`ALTER TABLE crawl_sessions_new RENAME TO crawl_sessions;`);
              
              console.log("Removed chroma_path from crawl_sessions");
            }
            
            // Check user_settings table
            const userSettingsColumns = await dbConn.select<{ name: string }[]>(
              "PRAGMA table_info(user_settings)"
            );
            
            if (userSettingsColumns.some(col => col.name === 'chroma_path')) {
              // Create a new table without chroma_path
              await dbConn.execute(`
                CREATE TABLE user_settings_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  openai_key TEXT,
                  language TEXT,
                  language_version TEXT,
                  framework TEXT,
                  framework_version TEXT,
                  library TEXT,
                  library_version TEXT
                );
              `);
              
              // Copy data excluding chroma_path
              await dbConn.execute(`
                INSERT INTO user_settings_new (id, openai_key, language, language_version, framework, framework_version, library, library_version)
                SELECT id, openai_key, language, language_version, framework, framework_version, library, library_version FROM user_settings;
              `);
              
              // Drop old table and rename new one
              await dbConn.execute(`DROP TABLE user_settings;`);
              await dbConn.execute(`ALTER TABLE user_settings_new RENAME TO user_settings;`);
              
              console.log("Removed chroma_path from user_settings");
            }
          } catch (error) {
            console.error("Error in migration:", error);
            throw error;
          }
        }
      },
      {
        name: 'create_vector_db_settings',
        up: async () => {
          console.log("Running migration: create_vector_db_settings");
          
          try {
            await dbConn.execute(`
              CREATE TABLE IF NOT EXISTS vector_db_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pinecone_api_key TEXT,
                pinecone_environment TEXT,
                pinecone_index TEXT,
                pinecone_project TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
            `);

            // Create trigger to update updated_at timestamp
            await dbConn.execute(`
              CREATE TRIGGER IF NOT EXISTS vector_db_settings_updated_at 
              AFTER UPDATE ON vector_db_settings
              BEGIN
                UPDATE vector_db_settings SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
              END;
            `);

            console.log("Created vector_db_settings table");
          } catch (error) {
            console.error("Error in migration:", error);
            throw error;
          }
        }
      },
      {
        name: 'remove_pinecone_project',
        up: async () => {
          console.log("Running migration: remove_pinecone_project");
          
          try {
            // Create a new table without pinecone_project
            await dbConn.execute(`
              CREATE TABLE IF NOT EXISTS vector_db_settings_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pinecone_api_key TEXT,
                pinecone_environment TEXT,
                pinecone_index TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
            `);

            // Copy data from old table to new table
            await dbConn.execute(`
              INSERT INTO vector_db_settings_new (id, pinecone_api_key, pinecone_environment, pinecone_index, created_at, updated_at)
              SELECT id, pinecone_api_key, pinecone_environment, pinecone_index, created_at, updated_at 
              FROM vector_db_settings;
            `);

            // Drop old table and rename new one
            await dbConn.execute('DROP TABLE vector_db_settings;');
            await dbConn.execute('ALTER TABLE vector_db_settings_new RENAME TO vector_db_settings;');

            // Recreate the trigger on the new table
            await dbConn.execute(`
              CREATE TRIGGER IF NOT EXISTS vector_db_settings_updated_at 
              AFTER UPDATE ON vector_db_settings
              BEGIN
                UPDATE vector_db_settings SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
              END;
            `);

            console.log("Removed pinecone_project from vector_db_settings table");
          } catch (error) {
            console.error("Error in migration:", error);
            throw error;
          }
        }
      },
      {
        name: 'create_vector_db_config',
        up: async () => {
          console.log("Running migration: create_vector_db_config");
          
          try {
            await dbConn.execute(`
              CREATE TABLE IF NOT EXISTS vector_db_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL UNIQUE,
                provider_type TEXT NOT NULL,
                config JSON NOT NULL CHECK(json_valid(config)),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
              );
            `);

            // Create trigger to update updated_at timestamp
            await dbConn.execute(`
              CREATE TRIGGER IF NOT EXISTS vector_db_config_updated_at 
              AFTER UPDATE ON vector_db_config
              BEGIN
                UPDATE vector_db_config SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
              END;
            `);

            // Create index on session_id for faster lookups
            await dbConn.execute(`
              CREATE INDEX IF NOT EXISTS idx_vector_db_config_session_id 
              ON vector_db_config(session_id);
            `);

            console.log("Created vector_db_config table");
          } catch (error) {
            console.error("Error in migration:", error);
            throw error;
          }
        }
      },
      {
        name: 'update_vector_db_config_schema',
        up: async () => {
          console.log("Running migration: update_vector_db_config_schema");
          
          try {
            // Create providers table
            await dbConn.execute(`
              CREATE TABLE IF NOT EXISTS vector_db_providers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                version TEXT NOT NULL,
                schema JSON NOT NULL CHECK(json_valid(schema)),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
            `);

            // Create configurations table
            await dbConn.execute(`
              CREATE TABLE IF NOT EXISTS vector_db_configurations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                provider_id INTEGER NOT NULL,
                config JSON NOT NULL CHECK(json_valid(config)),
                is_default BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(provider_id) REFERENCES vector_db_providers(id)
              );
            `);

            // Create session mappings table
            await dbConn.execute(`
              CREATE TABLE IF NOT EXISTS session_vector_db_mappings (
                session_id INTEGER NOT NULL,
                config_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(session_id, config_id),
                FOREIGN KEY(session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY(config_id) REFERENCES vector_db_configurations(id)
              );
            `);

            // Create indexes
            await dbConn.execute(`
              CREATE INDEX IF NOT EXISTS idx_vector_db_providers_name ON vector_db_providers(name);
              CREATE INDEX IF NOT EXISTS idx_vector_db_configurations_provider ON vector_db_configurations(provider_id);
              CREATE INDEX IF NOT EXISTS idx_session_vector_db_mappings_session ON session_vector_db_mappings(session_id);
            `);

            // Create triggers for updated_at
            await dbConn.execute(`
              CREATE TRIGGER IF NOT EXISTS vector_db_configurations_updated_at 
              AFTER UPDATE ON vector_db_configurations
              BEGIN
                UPDATE vector_db_configurations SET updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.id;
              END;
            `);

            console.log("Created new vector DB schema tables");
          } catch (error) {
            console.error("Error in migration:", error);
            throw error;
          }
        }
      }
    ];
    
    // Run migrations that haven't been applied yet
    for (const migration of migrations) {
      if (!appliedMigrationNames.includes(migration.name)) {
        await migration.up();
        
        // Record that migration has been applied
        await dbConn.execute(
          'INSERT INTO migrations (name) VALUES (?)',
          [migration.name]
        );
        
        console.log(`Applied migration: ${migration.name}`);
      }
    }
    
    console.log("Database migrations completed");
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  }
}; 