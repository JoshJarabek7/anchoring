// Fetch proxies from the remote URL
#[tauri::command]
async fn fetch_proxies() -> Result<Vec<String>, String> {
    use reqwest::Client;
    
    let url = "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt";
    
    let client = Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let body = response.text().await.map_err(|e| e.to_string())?;
    
    // Split by newlines and filter out empty lines
    let proxies: Vec<String> = body
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
        .collect();
    
    Ok(proxies)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .plugin(tauri_plugin_sql::Builder::new()
            .add_migrations("sqlite:anchoring.db", vec![])
            .build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_proxies
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
