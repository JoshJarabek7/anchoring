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

/// Fetch a URL using headless Chrome with full JavaScript rendering
#[tauri::command]
async fn fetch_with_headless_browser(url: String) -> Result<String, String> {
    use headless_chrome::{Browser, LaunchOptions};
    use tokio::task;
    use std::path::Path;

    println!("Fetching URL with headless Chrome: {}", url);

    // Check if Chrome is installed before proceeding
    // This function now runs its own tokio runtime internally
    match ensure_chrome_installed() {
        Ok(_) => println!("Chrome is installed and ready"),
        Err(e) => return Err(format!("Failed to ensure Chrome is installed: {}", e)),
    }
    
    // Find Chrome executable path
    let chrome_executable = find_chrome_path().ok_or_else(|| 
        "Could not find Chrome executable path".to_string()
    )?;
    
    println!("Using Chrome at: {}", chrome_executable);

    // Create a clone of url for the spawn_blocking closure
    let url_clone = url.clone();
    let chrome_path = chrome_executable.clone();
    
    // Use tokio blocking task for headless_chrome operations which are not async-compatible
    let html = task::spawn_blocking(move || -> Result<String, String> {
        // Configure browser options for optimal web scraping
        let launch_options = LaunchOptions::default_builder()
            .headless(true)
            .path(Some(Path::new(&chrome_path).to_path_buf()))
            .sandbox(false)
            .window_size(Some((1920, 1080)))
            .build()
            .map_err(|e| format!("Failed to build launch options: {}", e))?;
        
        // Launch browser with our options
        let browser = match Browser::new(launch_options) {
            Ok(browser) => browser,
            Err(e) => return Err(format!("Failed to launch browser: {}", e)),
        };

        // Create a new tab
        let tab = match browser.new_tab() {
            Ok(tab) => tab,
            Err(e) => return Err(format!("Failed to create new tab: {}", e)),
        };

        // Navigate to URL
        match tab.navigate_to(&url_clone) {
            Ok(_) => (),
            Err(e) => return Err(format!("Failed to navigate to {}: {}", url_clone, e)),
        }

        // Wait for page to load
        match tab.wait_until_navigated() {
            Ok(_) => println!("Initial page load complete"),
            Err(e) => return Err(format!("Failed to wait for navigation: {}", e)),
        }

        // Wait for document to be ready
        match wait_for_document_ready(&tab) {
            Ok(_) => println!("Document ready state complete"),
            Err(e) => println!("Warning: Could not confirm document ready state: {}", e),
        }
        
        // Scroll through the page to load lazy content
        match scroll_page_for_lazy_loading(&tab) {
            Ok(_) => println!("Page scrolled to load lazy content"),
            Err(e) => println!("Warning: Could not scroll page: {}", e),
        }
        
        // Get the final HTML content
        let html = match tab.get_content() {
            Ok(content) => content,
            Err(e) => return Err(format!("Failed to get page content: {}", e)),
        };

        println!("Successfully fetched content ({} bytes)", html.len());
        Ok(html)
    }).await.map_err(|e| format!("Task execution error: {}", e))?;

    html
}

/// Helper function to wait for document ready state
fn wait_for_document_ready(tab: &headless_chrome::Tab) -> Result<(), String> {
    let script = r#"
    new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve(true);
            return;
        }
        
        document.addEventListener('readystatechange', () => {
            if (document.readyState === 'complete') {
                setTimeout(() => resolve(true), 500);
            }
        });
    })
    "#;
    
    match tab.evaluate(script, true) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Document ready check failed: {}", e)),
    }
}

/// Helper function to scroll through page to trigger lazy loading
fn scroll_page_for_lazy_loading(tab: &headless_chrome::Tab) -> Result<(), String> {
    let script = r#"
    new Promise((resolve) => {
        const maxHeight = Math.max(
            document.body.scrollHeight, 
            document.documentElement.scrollHeight
        );
        
        let currentPosition = 0;
        const step = window.innerHeight / 2;
        
        function doScroll() {
            if (currentPosition < maxHeight) {
                currentPosition += step;
                window.scrollTo(0, currentPosition);
                setTimeout(doScroll, 100);
            } else {
                window.scrollTo(0, 0);
                resolve(true);
            }
        }
        
        doScroll();
    })
    "#;
    
    match tab.evaluate(script, true) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Scroll operation failed: {}", e)),
    }
}

/// Find Chrome or Chromium executable path
fn find_chrome_path() -> Option<String> {
    use std::path::Path;
    
    // Define possible Chrome paths based on OS
    #[cfg(target_os = "windows")]
    let chrome_paths = vec![
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Google\Chrome Beta\Application\chrome.exe",
        r"C:\Program Files\Google\Chrome Dev\Application\chrome.exe",
        r"C:\Program Files\Google\Chrome Canary\Application\chrome.exe",
        r"C:\Program Files\Chromium\Application\chrome.exe",
    ];
    
    #[cfg(target_os = "macos")]
    let chrome_paths = vec![
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
        "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/usr/local/bin/chromium",
    ];
    
    #[cfg(target_os = "linux")]
    let chrome_paths = vec![
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome-beta",
        "/usr/bin/google-chrome-dev",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
    ];
    
    // Check each path and return the first one that exists
    for path in chrome_paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    
    None
}

/// Sets up Chrome environment for headless browsing
fn ensure_chrome_installed() -> Result<(), String> {
    // Find Chrome executable
    match find_chrome_path() {
        Some(path) => {
            println!("Found Chrome/Chromium at: {}", path);
            Ok(())
        },
        None => {
            Err("Chrome or Chromium is not installed in standard locations. Please install Chrome/Chromium browser.".to_string())
        }
    }
}

/// Convert HTML content to Markdown format
/// 
/// This command provides a Rust implementation of the HTML to Markdown conversion
/// that was previously done in JavaScript. It uses the html2md crate to perform
/// the conversion efficiently, especially for large HTML documents.
#[tauri::command]
fn convert_html_to_markdown(html: String) -> Result<String, String> {
    use std::time::Instant;
    
    println!("Converting HTML to Markdown using Rust implementation");
    println!("HTML content length: {} characters", html.len());
    println!("HTML content preview: {}", &html[..std::cmp::min(100, html.len())]);
    
    let start = Instant::now();
    
    // Perform the conversion using html2md
    let result = match std::panic::catch_unwind(|| {
        html2md::parse_html(&html)
    }) {
        Ok(markdown) => markdown,
        Err(e) => return Err(format!("Failed to convert HTML to Markdown: {:?}", e)),
    };
    
    let duration = start.elapsed();
    
    println!("✅ HTML to Markdown conversion completed in {}ms", duration.as_millis());
    println!("Markdown length: {} characters", result.len());
    println!("Markdown preview: {}", &result[..std::cmp::min(100, result.len())]);
    
    Ok(result)
}

/// Chunk text using semantic boundaries and token counts
/// 
/// This function splits text into optimized chunks for language models,
/// using semantic boundaries (paragraphs, sentences, headings, code blocks)
/// and respecting token limits for different models:
/// - cl100k_base for text-embedding-3-large (8,191 tokens max)
/// - o200k_base for gpt-4o-mini (128,000 tokens max)
///
/// It automatically detects content type (markdown, code) and applies
/// the appropriate splitting strategy.
#[tauri::command]
fn split_text_by_tokens(
    text: String, 
    model_type: String, 
    chunk_size: usize, 
    chunk_overlap: usize,
    content_type: Option<String>
) -> Result<Vec<String>, String> {
    use std::time::Instant;
    use text_splitter::{TextSplitter, ChunkConfig, MarkdownSplitter};
    use tiktoken_rs::{cl100k_base, o200k_base};
    
    println!("Splitting text using Rust implementation");
    println!("Text length: {} characters", text.len());
    println!("Model type: {}, Chunk size: {}, Overlap: {}", model_type, chunk_size, chunk_overlap);
    
    let start = Instant::now();
    
    // Define model-specific parameters
    let (model_name, max_tokens) = match model_type.as_str() {
        "cl100k_base" | "text-embedding-3-large" => ("cl100k_base", 8191),
        "o200k_base" | "gpt-4o-mini" => ("o200k_base", 128000),
        _ => return Err(format!("Unsupported model type: {}. Use 'cl100k_base'/'text-embedding-3-large' or 'o200k_base'/'gpt-4o-mini'", model_type)),
    };
    
    // Use provided chunk size or default to model's max tokens
    let actual_chunk_size = if chunk_size == 0 { max_tokens } else { chunk_size };
    
    // Define chunk range with overlap
    let chunk_range = (actual_chunk_size - chunk_overlap)..actual_chunk_size;
    
    // Detect content type if not explicitly provided
    let is_markdown = match content_type {
        Some(ctype) => ctype.to_lowercase() == "markdown",
        None => {
            // Simple detection logic for markdown
            text.contains("```") || text.contains("##") || (text.contains("#") && text.contains("\n"))
        }
    };

    // Process based on model and content type (markdown or plain text)
    let result: Vec<String> = if model_name == "cl100k_base" {
        let tokenizer = cl100k_base().map_err(|e| format!("Failed to initialize cl100k tokenizer: {}", e))?;
        
        if is_markdown {
            println!("Using Markdown splitter with cl100k tokenizer");
            let config = ChunkConfig::new(chunk_range).with_sizer(tokenizer);
            let splitter = MarkdownSplitter::new(config);
            splitter.chunks(&text).map(|s| s.to_string()).collect()
        } else {
            println!("Using Text splitter with cl100k tokenizer");
            let config = ChunkConfig::new(chunk_range).with_sizer(tokenizer);
            let splitter = TextSplitter::new(config);
            splitter.chunks(&text).map(|s| s.to_string()).collect()
        }
    } else {
        let tokenizer = o200k_base().map_err(|e| format!("Failed to initialize o200k tokenizer: {}", e))?;
        
        if is_markdown {
            println!("Using Markdown splitter with o200k tokenizer");
            let config = ChunkConfig::new(chunk_range).with_sizer(tokenizer);
            let splitter = MarkdownSplitter::new(config);
            splitter.chunks(&text).map(|s| s.to_string()).collect()
        } else {
            println!("Using Text splitter with o200k tokenizer");
            let config = ChunkConfig::new(chunk_range).with_sizer(tokenizer);
            let splitter = TextSplitter::new(config);
            splitter.chunks(&text).map(|s| s.to_string()).collect()
        }
    };
    
    let duration = start.elapsed();
    
    println!("✅ Text splitting completed in {}ms", duration.as_millis());
    println!("Created {} chunks", result.len());
    
    Ok(result)
}

// Code splitter functionality removed as not needed

/// Count tokens in a text string using different tokenizers
///
/// This function counts tokens in text using the specified tokenizer model:
/// - cl100k_base for text-embedding-3-large
/// - o200k_base for gpt-4o-mini
#[tauri::command]
fn count_tokens(text: String, model_type: String) -> Result<usize, String> {
    use tiktoken_rs::{cl100k_base, o200k_base};
    
    let token_count = match model_type.as_str() {
        "cl100k_base" | "text-embedding-3-large" => {
            let tokenizer = cl100k_base().map_err(|e| format!("Failed to initialize cl100k tokenizer: {}", e))?;
            tokenizer.encode_with_special_tokens(&text).len()
        },
        "o200k_base" | "gpt-4o-mini" => {
            let tokenizer = o200k_base().map_err(|e| format!("Failed to initialize o200k tokenizer: {}", e))?;
            tokenizer.encode_with_special_tokens(&text).len()
        },
        _ => return Err(format!("Unsupported model type: {}. Use 'cl100k_base' or 'o200k_base'", model_type)),
    };
    
    Ok(token_count)
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
            fetch_proxies,
            fetch_with_headless_browser,
            convert_html_to_markdown,
            split_text_by_tokens,
            count_tokens
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
