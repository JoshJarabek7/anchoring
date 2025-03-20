use crate::db::models::Proxy;
use crate::db::repositories::Repository;
use crate::db::schema::proxies;
use crate::db::{get_pg_connection, DbError};
use crate::impl_repository;
use diesel::prelude::*;
use uuid;

/// Repository for Proxy CRUD operations in the database
/// Follows the repository pattern - only database operations
#[derive(Debug)]
pub struct ProxyRepository;

impl ProxyRepository {
    pub fn new() -> Self {
        Self {}
    }

    /// Save a batch of proxies to the database, clearing existing ones first
    pub async fn save_proxies_batch(&self, proxy_urls: &[String]) -> Result<Vec<Proxy>, DbError> {
        let proxy_urls = proxy_urls.to_vec();

        tokio::task::spawn_blocking(move || -> Result<Vec<Proxy>, DbError> {
            let mut conn = get_pg_connection()?;

            // Begin a transaction
            conn.transaction::<_, DbError, _>(|conn| {
                // Clear existing proxies
                diesel::delete(proxies::table)
                    .execute(conn)
                    .map_err(DbError::QueryError)?;

                // Insert new proxies in batches for better performance
                let mut inserted_count = 0;
                for url in proxy_urls {
                    let new_proxy = Proxy {
                        id: uuid::Uuid::new_v4(),
                        url: url.clone(),
                        last_used: None,
                    };

                    let result = diesel::insert_into(proxies::table)
                        .values(&new_proxy)
                        .execute(conn);

                    match result {
                        Ok(_) => inserted_count += 1,
                        Err(e) => {
                            // Ignore duplicate key errors
                            if e.to_string()
                                .contains("duplicate key value violates unique constraint")
                            {
                                println!("Duplicate proxy ignored: {}", url);
                            } else {
                                return Err(DbError::QueryError(e));
                            }
                        }
                    }
                }

                println!("Inserted {} proxies", inserted_count);
                Ok(())
            })?;

            // Return all proxies
            let proxies = proxies::table
                .load::<Proxy>(&mut conn)
                .map_err(DbError::QueryError)?;

            Ok(proxies)
        })
        .await
        .map_err(|e| DbError::Unknown(format!("Task join error: {}", e)))?
    }
}

// Use the macro to implement Repository trait
impl_repository!(
    ProxyRepository,
    Proxy,
    uuid::Uuid,
    proxies::table,
    proxies::id
);

// Convenient public functions
pub async fn get_all_proxies() -> Result<Vec<Proxy>, DbError> {
    ProxyRepository::new().get_all().await
}

pub async fn get_proxy(id: uuid::Uuid) -> Result<Option<Proxy>, DbError> {
    ProxyRepository::new().get_by_id(id).await
}

pub async fn create_proxy(proxy: Proxy) -> Result<Proxy, DbError> {
    ProxyRepository::new().create(&proxy).await
}

pub async fn update_proxy(id: uuid::Uuid, proxy: Proxy) -> Result<Proxy, DbError> {
    ProxyRepository::new().update(id, &proxy).await
}

pub async fn delete_proxy(id: uuid::Uuid) -> Result<bool, DbError> {
    ProxyRepository::new().delete(id).await
}

pub async fn save_proxies_batch(proxy_urls: &[String]) -> Result<Vec<Proxy>, DbError> {
    ProxyRepository::new().save_proxies_batch(proxy_urls).await
}
