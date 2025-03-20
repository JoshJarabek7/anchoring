mod commands;
mod db;
mod services;

use tauri::Manager;
use tauri::Listener;

pub fn run() {
    println!("===== APPLICATION STARTUP PROCESS BEGINNING =====");
    println!("Starting initialization...");

    // Initialize database on startup
    tauri::async_runtime::block_on(async {
        println!("[Database] Initializing database during app startup...");
        match db::init_db(None).await {
            Ok(_) => println!("[Database] Database initialized successfully at startup"),
            Err(e) => eprintln!(
                "[Database] WARNING: Failed to initialize database at startup: {}",
                e
            ),
        }
    });

    println!("[Builder] Creating Tauri builder...");

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let event_emitter = services::EventEmitter::new(app.handle().clone());
            app.manage(event_emitter.clone());

            services::Services::initialize(app.handle().clone(), event_emitter);

            // Set up global event listeners
            app.listen("crawl-started", |event| {
                println!("Crawling started for URL: {}", event.payload());
            });

            app.listen("markdown-cleaning-started", |event| {
                println!("Markdown cleaning started for {} URLs", event.payload());
            });

            app.listen("snippet-generation-started", |event| {
                println!("Snippet generation started for {} URLs", event.payload());
            });

            // Create a WebviewWindow with standard styling
            let mut window_builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Anchoring");

            // Set transparent title bar on macOS
            #[cfg(target_os = "macos")]
            {
                window_builder =
                    window_builder.title_bar_style(tauri_utils::TitleBarStyle::Transparent);
            }

            let webview_window = window_builder.build()?;

            // Show the window
            webview_window.show()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Proxy commands
            commands::get_proxies,
            commands::fetch_and_save_proxies,
            // Technology commands
            commands::get_technologies,
            commands::get_technology_versions,
            commands::create_technology,
            commands::create_technology_version,
            commands::delete_technology,
            commands::delete_technology_version,
            // Documentation URL commands
            commands::add_documentation_url,
            commands::get_version_documentation_urls,
            commands::get_full_documentation_url,
            // Crawling settings
            commands::get_version_crawling_settings,
            commands::save_version_crawling_settings,
            // Crawling commands
            commands::start_crawling,
            commands::stop_all_crawling,
            commands::stop_tech_version_crawling,
            commands::clean_markdown,
            commands::generate_snippets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
