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
    
    // Clean up any removed migrations that might be in the migrations table
    await cleanupRemovedMigrations(dbConn);
    
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
          
          try {
            // Get column info to check if chroma_path exists in crawl_sessions
            const sessionColumns = await dbConn.select<{ name: string }[]>(
              "PRAGMA table_info(crawl_sessions)"
            );
            
            // Get column info to check if chroma_path exists in user_settings
            const userSettingsColumns = await dbConn.select<{ name: string }[]>(
              "PRAGMA table_info(user_settings)"
            );
            
            const needsSessionMigration = sessionColumns.some(col => col.name === 'chroma_path');
            const needsSettingsMigration = userSettingsColumns.some(col => col.name === 'chroma_path');
            
            // Only start a transaction if we need to make changes
            if (needsSessionMigration || needsSettingsMigration) {
              // Use transactions for atomicity
              await dbConn.execute('BEGIN TRANSACTION');
              
              try {
                if (needsSessionMigration) {
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
                
                if (needsSettingsMigration) {
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
            } else {
              console.log("No chroma_path columns found, skipping migration");
            }
          } catch (error) {
            console.error("Error in migration:", error);
            throw error;
          }
        }
      }
    ];
    
    // Run migrations that haven't been applied yet
    for (const migration of migrations) {
      // Skip if migration is already recorded
      if (appliedMigrationNames.includes(migration.name)) {
        console.log(`Migration ${migration.name} already applied, skipping`);
        continue;
      }
      
      try {
        // Run the migration
        await migration.up();
        
        // Check if the migration was recorded during the up() function
        const checkMigration = await dbConn.select<{ name: string }[]>(
          'SELECT name FROM migrations WHERE name = ?',
          [migration.name]
        );
        
        // Only record the migration if it hasn't been recorded yet
        if (checkMigration.length === 0) {
          // Record that migration has been applied
          await dbConn.execute(
            'INSERT INTO migrations (name) VALUES (?)',
            [migration.name]
          );
          
          console.log(`Recorded migration: ${migration.name}`);
        } else {
          console.log(`Migration ${migration.name} already recorded, skipping record`);
        }
        
        console.log(`Applied migration: ${migration.name}`);
      } catch (error) {
        console.error(`Error applying migration ${migration.name}:`, error);
        throw error;
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

/**
 * Clean up any migrations that have been removed from the code but might
 * still be in the migrations table
 */
async function cleanupRemovedMigrations(dbConn: Database) {
  try {
    // Check if the add_vector_db_settings migration exists in the table
    const migrationExists = await dbConn.select<{ name: string }[]>(
      'SELECT name FROM migrations WHERE name = ?',
      ['add_vector_db_settings']
    );
    
    if (migrationExists.length > 0) {
      console.log("Removing obsolete migration record: add_vector_db_settings");
      await dbConn.execute(
        'DELETE FROM migrations WHERE name = ?',
        ['add_vector_db_settings']
      );
    }
  } catch (error) {
    console.error("Error cleaning up removed migrations:", error);
  }
} 