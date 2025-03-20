use crate::db::models::Proxy;
use crate::db::repositories::proxies::ProxyRepository;
use crate::db::repositories::Repository;
use reqwest::Client;

const PROXY_URL: &str = "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt";

/// Service for managing proxies
///
/// This service handles all operations related to proxies:
/// - Fetching and saving proxies from external sources
/// - Getting available proxies
/// - Updating proxy status
/// - Selecting the next proxy to use

#[derive(Debug)]
pub struct ProxyService {
    repository: ProxyRepository,
}

impl Default for ProxyService {
    fn default() -> Self {
        Self::new()
    }
}

impl ProxyService {
    /// Create a new ProxyService instance
    pub fn new() -> Self {
        Self {
            repository: ProxyRepository::new(),
        }
    }

    /// Fetch proxies from the remote source and return them
    pub async fn fetch_proxies_from_source(&self) -> Result<Vec<String>, String> {
        let client = Client::new();
        let response = client
            .get(PROXY_URL)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch proxies: {}", e))?;

        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Split by newlines and filter out empty lines
        let proxies: Vec<String> = body
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .collect();

        Ok(proxies)
    }

    /// Fetch proxies from external sources and save them to the database
    pub async fn fetch_and_save_proxies(&self) -> Result<Vec<Proxy>, String> {
        // Fetch proxies from the external source
        let proxy_urls = self.fetch_proxies_from_source().await?;

        // Save them to the database using the repository
        self.repository
            .save_proxies_batch(&proxy_urls)
            .await
            .map_err(|e| format!("Error saving proxies: {}", e))
    }

    /// Get all available proxies from the database
    pub async fn get_proxies(&self) -> Result<Vec<Proxy>, String> {
        self.repository
            .get_all()
            .await
            .map_err(|e| format!("Error getting proxies: {}", e))
    }
}
