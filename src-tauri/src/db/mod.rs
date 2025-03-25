use diesel::prelude::*;
use diesel::r2d2::{self, ConnectionManager, Pool};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::env;
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
pub mod models;
pub mod pgvector;
pub mod repositories;
pub mod schema;

// Constants
const POSTGRES_URI_ENV_VAR: &str = "ANCHORING_POSTGRES_URI";

// Embed PostgreSQL migration
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("src/db/migrations");

// Database errors
#[derive(thiserror::Error, Debug)]
pub enum DbError {
    #[error("Database connection error: {0}")]
    ConnectionError(String),

    #[error("Query execution error: {0}")]
    QueryError(#[from] diesel::result::Error),

    #[error("Migration error: {0}")]
    MigrationError(String),

    #[error("Pool error: {0}")]
    PoolError(#[from] r2d2::Error),

    #[error("Database initialization already in progress")]
    AlreadyInitializing,

    #[error("Database not initialized")]
    NotInitialized,

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("PgVector error: {0}")]
    PgVectorError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

// Global PostgreSQL pool
static PG_POOL: OnceLock<Pool<ConnectionManager<PgConnection>>> = OnceLock::new();

// PostgreSQL pool type
pub type PgPool = Pool<ConnectionManager<PgConnection>>;

// Lock for preventing concurrent initialization
fn initializing() -> Arc<Mutex<bool>> {
    static INITIALIZING: OnceLock<Arc<Mutex<bool>>> = OnceLock::new();
    INITIALIZING
        .get_or_init(|| Arc::new(Mutex::new(false)))
        .clone()
}

/// Get the PostgreSQL connection string from environment variable
pub fn get_connection_string() -> Result<String, DbError> {
    env::var(POSTGRES_URI_ENV_VAR).map_err(|_| {
        DbError::ConfigError(format!(
            "Environment variable {} not set",
            POSTGRES_URI_ENV_VAR
        ))
    })
}

/// Initialize database with migrations
pub async fn init_db(connection_string: Option<String>) -> Result<(), DbError> {
    let start = Instant::now();
    println!("Starting database initialization");

    // Prevent concurrent initialization
    let initializing_mutex = initializing();
    {
        let mut initializing = initializing_mutex
            .lock()
            .map_err(|e| DbError::Unknown(format!("Failed to acquire lock: {}", e)))?;

        // Check if initialization is already in progress
        if *initializing {
            return Err(DbError::AlreadyInitializing);
        }

        // Set initializing flag
        *initializing = true;
    } // lock is released here

    // Setup timeout for safety
    let initializing_for_timeout = initializing_mutex.clone();
    let timeout_handle = tokio::task::spawn(async move {
        // Use configurable timeout instead of hardcoded 30 seconds
        let timeout_duration = repositories::TimeoutConfig::default().init_timeout_secs;
        tokio::time::sleep(std::time::Duration::from_secs(timeout_duration)).await;
        if let Ok(mut flag) = initializing_for_timeout.lock() {
            if *flag {
                println!("Database initialization timeout - resetting flag");
                *flag = false;
            }
        }
    });

    let result = match connection_string {
        Some(conn_str) => {
            // Use the provided connection string
            println!("Using provided PostgreSQL connection string");
            init_postgres(&conn_str).await
        }
        None => {
            // Try to load from environment variable
            println!("Loading PostgreSQL connection string from environment variable");
            match get_connection_string() {
                Ok(conn_str) => {
                    println!("PostgreSQL connection string loaded from environment variable");
                    init_postgres(&conn_str).await
                }
                Err(e) => Err(e),
            }
        }
    };

    // Reset initializing flag
    {
        if let Ok(mut initializing) = initializing_mutex.lock() {
            *initializing = false;
        }
    }

    // Cancel timeout task
    timeout_handle.abort();

    match result {
        Ok(_) => {
            println!("Database initialization completed in {:?}", start.elapsed());
            Ok(())
        }
        Err(e) => {
            println!("Database initialization failed: {}", e);
            Err(e)
        }
    }
}

// Initialize PostgreSQL database
async fn init_postgres(connection_string: &str) -> Result<(), DbError> {
    println!("Initializing PostgreSQL database");

    // Check for an existing pool
    if PG_POOL.get().is_some() {
        println!("PostgreSQL pool already initialized");
        return Ok(());
    }

    // Create connection manager and pool
    let manager = ConnectionManager::<PgConnection>::new(connection_string);
    let pool = Pool::builder()
        .max_size(32)
        .connection_timeout(Duration::from_secs(10))
        .build(manager)
        .map_err(|e| {
            DbError::ConnectionError(format!("Failed to create connection pool: {}", e))
        })?;

    // Initialize the database with migrations
    run_migrations_postgres(&pool)?;

    // Store the pool globally
    match PG_POOL.set(pool) {
        Ok(_) => {
            println!("PostgreSQL pool initialized successfully");
            Ok(())
        }
        Err(_) => Err(DbError::Unknown(
            "Failed to store PostgreSQL pool".to_string(),
        )),
    }
}

// Run migrations on the PostgreSQL database
fn run_migrations_postgres(pool: &PgPool) -> Result<(), DbError> {
    let mut conn = pool.get().map_err(|e| {
        DbError::ConnectionError(format!("Failed to get connection from pool: {}", e))
    })?;
    conn.run_pending_migrations(MIGRATIONS)
        .map_err(|e| DbError::MigrationError(format!("Failed to run migrations: {}", e)))?;
    Ok(())
}

// Get a PostgreSQL connection from the pool
pub fn get_pg_connection(
) -> Result<r2d2::PooledConnection<ConnectionManager<PgConnection>>, DbError> {
    PG_POOL
        .get()
        .ok_or(DbError::NotInitialized)?
        .get()
        .map_err(|e| DbError::ConnectionError(format!("Failed to get connection from pool: {}", e)))
}
