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
    
    // Check for interrupted migrations and fix them
    await repairInterruptedMigrations(dbConn);
    
    // Define migrations
    const migrations = [
      {
        name: 'remove_chroma_path',
        up: async () => {
          console.log("Running migration: remove_chroma_path");
          
          // Use transactions for atomicity
          await dbConn.execute('BEGIN TRANSACTION');
          
          try {
            // Get column info to check if chroma_path exists in crawl_sessions
            const sessionColumns = await dbConn.select<{ name: string }[]>(
              "PRAGMA table_info(crawl_sessions)"
            );
            
            if (sessionColumns.some(col => col.name === 'chroma_path')) {
              // Create a new table without chroma_path
              await dbConn.execute(`
                CREATE TABLE IF NOT EXISTS crawl_sessions_new (
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
                CREATE TABLE IF NOT EXISTS user_settings_new (
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
            
            // Commit transaction if all steps succeeded
            await dbConn.execute('COMMIT');
          } catch (error) {
            // Rollback transaction on error
            await dbConn.execute('ROLLBACK');
            console.error("Error in migration - rolled back:", error);
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

/**
 * Repair any interrupted migrations by checking for temporary tables
 * and completing their migrations if needed.
 */
async function repairInterruptedMigrations(dbConn: Database) {
  try {
    // Get all tables in the database
    const tables = await dbConn.select<{ name: string }[]>(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    
    const tableNames = tables.map(t => t.name);
    
    // Check for crawl_sessions_new
    if (tableNames.includes('crawl_sessions_new')) {
      console.log("Found interrupted migration: crawl_sessions_new exists");
      
      if (tableNames.includes('crawl_sessions')) {
        console.log("Both crawl_sessions and crawl_sessions_new exist - completing migration");
        await dbConn.execute('BEGIN TRANSACTION');
        
        try {
          // Drop the old table and rename the new one
          await dbConn.execute(`DROP TABLE crawl_sessions;`);
          await dbConn.execute(`ALTER TABLE crawl_sessions_new RENAME TO crawl_sessions;`);
          
          await dbConn.execute('COMMIT');
          console.log("Repaired interrupted migration for crawl_sessions");
        } catch (error) {
          await dbConn.execute('ROLLBACK');
          console.error("Error repairing crawl_sessions migration:", error);
        }
      } else {
        // Old table is gone but new table wasn't renamed
        console.log("Only crawl_sessions_new exists - renaming to crawl_sessions");
        await dbConn.execute(`ALTER TABLE crawl_sessions_new RENAME TO crawl_sessions;`);
      }
    }
    
    // Check for user_settings_new
    if (tableNames.includes('user_settings_new')) {
      console.log("Found interrupted migration: user_settings_new exists");
      
      if (tableNames.includes('user_settings')) {
        console.log("Both user_settings and user_settings_new exist - completing migration");
        await dbConn.execute('BEGIN TRANSACTION');
        
        try {
          // Drop the old table and rename the new one
          await dbConn.execute(`DROP TABLE user_settings;`);
          await dbConn.execute(`ALTER TABLE user_settings_new RENAME TO user_settings;`);
          
          await dbConn.execute('COMMIT');
          console.log("Repaired interrupted migration for user_settings");
        } catch (error) {
          await dbConn.execute('ROLLBACK');
          console.error("Error repairing user_settings migration:", error);
        }
      } else {
        // Old table is gone but new table wasn't renamed
        console.log("Only user_settings_new exists - renaming to user_settings");
        await dbConn.execute(`ALTER TABLE user_settings_new RENAME TO user_settings;`);
      }
    }
  } catch (error) {
    console.error("Error checking for interrupted migrations:", error);
  }
} 