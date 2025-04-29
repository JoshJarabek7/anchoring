mod commands;
mod db;
mod mcp;
mod services;

use std::sync::Arc;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Listener, Manager, TitleBarStyle, WindowEvent};

pub fn run() {
    println!("===== APPLICATION STARTUP PROCESS BEGINNING =====");
    println!("Starting initialization...");

    // Check environment variables
    println!("[Environment] Checking required environment variables...");
    match std::env::var("ANCHORING_POSTGRES_URI") {
        Ok(value) => println!("[Environment] ANCHORING_POSTGRES_URI is set: {}", value),
        Err(_) => println!("[Environment] WARNING: ANCHORING_POSTGRES_URI is not set"),
    }

    match std::env::var("OPENAI_API_KEY") {
        Ok(value) => {
            let masked_key = if value.len() > 8 {
                format!("{}...", &value[0..16])
            } else {
                "***".to_string()
            };
            println!("[Environment] OPENAI_API_KEY is set: {}", masked_key);
        }
        Err(_) => println!("[Environment] WARNING: OPENAI_API_KEY is not set"),
    }

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

    // Create task count for tracking
    let task_count = Arc::new(Mutex::new(0));

    let mut builder = tauri::Builder::default();

    // Add single instance plugin on desktop platforms
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            move |app_handle, argv, cwd| {
                println!("Preventing second instance from starting...");
                println!("  Arguments: {:?}", argv);
                println!("  Current working directory: {:?}", cwd);

                // Focus the main window of the running instance
                if let Some(window) = app_handle.get_webview_window("main") {
                    window.unminimize().unwrap_or_default();
                    window.show().unwrap_or_default();
                    window.set_focus().unwrap_or_default();
                }
            },
        ));
    }

    // Build and run the application
    builder
        .setup(move |app| {
            // let app_handle = app.handle(); // Removed unused handle

            // Create the system tray menu
            let tray_menu = MenuBuilder::new(app)
                .item(&MenuItemBuilder::with_id("show", "Show Window").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
                .build()?;

            // Create the tray icon with menu
            let tray = TrayIconBuilder::new()
                .tooltip("Anchoring")
                .menu(&tray_menu)
                .icon(Image::from_bytes(include_bytes!("../icons/icon.png")).unwrap())
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                })
                .show_menu_on_left_click(true)
                .build(app)?;

            // Store the tray icon in the app state to access it later
            app.manage(Arc::new(Mutex::new(tray)));

            app.on_menu_event(move |app, event| {
                match event.id().0.as_str() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "quit" => {
                        // Perform cleanup before quitting
                        println!("Application shutdown initiated...");

                        // Shutdown MCP server
                        println!("Shutting down MCP server...");
                        mcp::shutdown_server();

                        // Get services and perform cleanup
                        let services = services::get_services();

                        // Stop all crawling tasks
                        if let Err(e) = services.crawler.stop_all_crawling() {
                            eprintln!("Error stopping crawling tasks: {}", e);
                        }

                        // Wait a moment for tasks to clean up
                        std::thread::sleep(std::time::Duration::from_millis(500));

                        app.exit(0);
                    }
                    _ => {}
                }
            });

            let event_emitter = services::EventEmitter::new(app.handle().clone());
            app.manage(event_emitter.clone());

            services::Services::initialize(event_emitter.clone());

            // Start the MCP server on its own port
            println!("[MCP] Starting Model Context Protocol server on port 8327");
            match mcp::start_server(8327) {
                Ok(_) => println!("[MCP] Server initialized successfully"),
                Err(e) => eprintln!("[MCP] Failed to start MCP server: {}", e),
            }

            // Set up global event listeners
            let app_handle = app.handle().clone();
            let task_count_clone = Arc::clone(&task_count);
            let app_handle_tooltip = app_handle.clone();
            app_handle.listen("task:created", move |_| {
                let mut count = task_count_clone.lock().unwrap();
                *count += 1;
                update_tray_tooltip(&app_handle_tooltip, *count);
            });

            let app_handle2 = app.handle().clone();
            let task_count_clone2 = Arc::clone(&task_count);
            let app_handle2_tooltip = app_handle2.clone();
            app_handle2.listen("task:completed", move |_| {
                let mut count = task_count_clone2.lock().unwrap();
                *count = count.saturating_sub(1);
                update_tray_tooltip(&app_handle2_tooltip, *count);
            });

            let task_count_clone3 = Arc::clone(&task_count);
            let app_handle3 = app.handle().clone();
            let app_handle3_tooltip = app_handle3.clone();
            app_handle3.listen("task:failed", move |_| {
                let mut count = task_count_clone3.lock().unwrap();
                *count = count.saturating_sub(1);
                update_tray_tooltip(&app_handle3_tooltip, *count);
            });

            let task_count_clone4 = Arc::clone(&task_count);
            let app_handle4 = app.handle().clone();
            let app_handle4_tooltip = app_handle4.clone();
            app_handle4.listen("task:cancelled", move |_| {
                let mut count = task_count_clone4.lock().unwrap();
                *count = count.saturating_sub(1);
                update_tray_tooltip(&app_handle4_tooltip, *count);
            });

            // Handle window close events for cleanup - fix thread safety issues
            if let Some(window) = app.get_webview_window("main") {
                let window_handle = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        // Prevent the window from closing
                        api.prevent_close();

                        // Hide the window instead of closing it
                        window_handle.hide().unwrap();
                    }
                });
            }

            // Apply macOS-specific styling to the main window
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // Set transparent title bar on macOS
                    window
                        .set_title_bar_style(TitleBarStyle::Transparent)
                        .unwrap();

                    // Set custom background color using the simpler documented approach
                    use cocoa::appkit::{NSColor, NSWindow};
                    use cocoa::base::{id, nil};

                    let ns_window = window.ns_window().unwrap() as id;
                    unsafe {
                        // Create a background color that matches the oceanic glassmorphism theme
                        // Using a deep blue-teal color with subtle transparency
                        let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                            nil,
                            6.0 / 255.0,  // Red (subtle amount for richness)
                            32.0 / 255.0, // Green (enough for slight teal undertone)
                            60.0 / 255.0, // Blue (deep blue that suggests ocean depths)
                            0.92, // Alpha (high but with slight transparency for glass effect)
                        );

                        // Set the window background color
                        // This will show through the transparent title bar
                        ns_window.setBackgroundColor_(bg_color);
                    }
                }
            }

            // Windows-specific styling
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // Make window transparent (if supported)
                    window.set_decorations(true).unwrap();

                    // Set transparent effect for the window
                    use window_shadows::set_shadow;
                    use window_vibrancy::{apply_acrylic, apply_blur, ApplyBlurType};

                    // Apply blur effect to the window
                    apply_blur(&window, Some((32, 32, 60, 235)))
                        .expect("Failed to apply blur effect");

                    // Add window shadows for depth
                    set_shadow(&window, true).expect("Failed to add window shadow");
                }
            }

            // Linux-specific styling
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // On Linux, full transparency isn't as well supported across all window managers
                    // Instead, we'll set a similar background color

                    // You can try to enable transparency if your window manager supports it
                    // This may not work on all Linux distributions/window managers
                    window.set_decorations(true).unwrap();

                    // We can try to set a CSS background color that matches the theme
                    // through the webview instead
                    let _ = window.eval(
                        r#"
                        document.documentElement.style.setProperty(
                            '--app-background-color', 
                            'rgba(6, 32, 60, 0.92)'
                        );
                        if (!document.body.style.background) {
                            document.body.style.background = 'rgba(6, 32, 60, 0.92)';
                        }
                    "#,
                    );
                }
            }

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
            commands::apply_url_filters,
            // Snippet search commands
            commands::vector_search_snippets,
            commands::get_snippet_concepts,
            commands::get_documentation_snippets,
            commands::get_documentation_snippet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn update_tray_tooltip(app: &tauri::AppHandle, count: u32) {
    let tray_state = app.state::<Arc<Mutex<tauri::tray::TrayIcon>>>();
    let tray = tray_state.lock().unwrap();

    let tooltip = if count > 0 {
        format!("Anchoring - {} active tasks", count)
    } else {
        "Anchoring".to_string()
    };

    tray.set_tooltip(Some(tooltip)).unwrap();
}
