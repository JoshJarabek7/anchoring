// Browser-related functionality service
use std::path::PathBuf;
use std::process::Command;

/// Service for managing browser-related operations
///
/// This service handles all operations related to browser automation:
/// - Finding and initializing the Chrome browser
/// - Fetching web content with headless Chrome
/// - Handling browser scrolling and interactions

#[derive(Debug)]
pub struct BrowserService;

impl Default for BrowserService {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserService {
    /// Create a new BrowserService instance
    pub fn new() -> Self {
        Self {}
    }

    /// Find the Chrome/Chromium executable path
    fn find_chrome_path(&self) -> Option<String> {
        // Standard locations for Chrome/Chromium
        let paths = if cfg!(target_os = "windows") {
            vec![
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            ]
        } else if cfg!(target_os = "macos") {
            vec![
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ]
        } else {
            vec![
                "/usr/bin/google-chrome",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/snap/bin/chromium",
            ]
        };

        // Check each path
        for path in paths {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        // Try to find Chrome/Chromium using 'which' on Unix systems
        if cfg!(unix) {
            if let Ok(output) = Command::new("which").arg("google-chrome").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout);
                    let path = path.trim();
                    if !path.is_empty() {
                        return Some(path.to_string());
                    }
                }
            }

            if let Ok(output) = Command::new("which").arg("chromium").output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout);
                    let path = path.trim();
                    if !path.is_empty() {
                        return Some(path.to_string());
                    }
                }
            }
        }

        None
    }

    /// Get the path to Chrome executable
    pub fn get_chrome_path(&self) -> Result<PathBuf, String> {
        match self.find_chrome_path() {
            Some(path) => Ok(PathBuf::from(path)),
            None => Err("Chrome or Chromium is not installed.".to_string()),
        }
    }

    /// Fetch a URL using headless Chrome with full JavaScript rendering
    /// and interaction with interactive elements like accordions and dropdowns
    pub async fn fetch_with_headless_browser(&self, url: String) -> Result<String, String> {
        use headless_chrome::{Browser, LaunchOptions};
        use tokio::task;

        // Get stored Chrome path (or find it if not already stored)
        let chrome_path = self.get_chrome_path()?;

        // Create a clone of url for the spawn_blocking closure
        let url_clone = url.clone();
        let chrome_path_clone = chrome_path.clone();

        // Use tokio's timeout to prevent task from running too long
        let timeout_duration = std::time::Duration::from_secs(300); // 5 minute timeout

        // Use tokio blocking task for headless_chrome operations which are not async-compatible
        let html = match tokio::time::timeout(
            timeout_duration,
            task::spawn_blocking(move || -> Result<String, String> {
                // Configure browser options for optimal web scraping
                let launch_options = LaunchOptions::default_builder()
                    .headless(true)
                    .path(Some(chrome_path_clone))
                    .sandbox(false)
                    .window_size(Some((1920, 1080)))
                    // Add longer timeouts to prevent connection issues
                    .idle_browser_timeout(std::time::Duration::from_secs(120))
                    // Add additional Chrome flags for better performance using OsStr values
                    .args(vec![
                        std::ffi::OsStr::new("--disable-dev-shm-usage"), // Overcome limited /dev/shm size
                        std::ffi::OsStr::new("--disable-setuid-sandbox"),
                        std::ffi::OsStr::new("--disable-web-security"), // Disable CORS restrictions
                        std::ffi::OsStr::new("--disable-features=IsolateOrigins,site-per-process"),
                        std::ffi::OsStr::new("--disable-background-timer-throttling"),
                        std::ffi::OsStr::new("--disable-backgrounding-occluded-windows"),
                        std::ffi::OsStr::new("--disable-breakpad"),
                        std::ffi::OsStr::new("--disable-hang-monitor"),
                        std::ffi::OsStr::new("--disable-ipc-flooding-protection"),
                        std::ffi::OsStr::new("--disable-client-side-phishing-detection"),
                    ])
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
                    Ok(_) => {}
                    Err(e) => return Err(format!("Failed to navigate to {}: {}", url_clone, e)),
                }

                // Wait for page to load
                match tab.wait_until_navigated() {
                    Ok(_) => {}
                    Err(e) => return Err(format!("Failed to wait for navigation: {}", e)),
                }

                // Wait for document to be ready
                match BrowserService::wait_for_document_ready(&tab) {
                    Ok(_) => {}
                    Err(_e) => {}
                }

                // Get content before interactions
                let simple_html = tab.get_content().ok();

                // Scroll through the page to load lazy content
                match BrowserService::scroll_page_for_lazy_loading(&tab) {
                    Ok(_) => {}
                    Err(_e) => {}
                }

                // Try to interact with interactive elements (accordions, dropdowns, tabs)
                BrowserService::interact_with_interactive_elements(&tab);

                // Scroll again after expansion
                BrowserService::scroll_page_for_lazy_loading(&tab);

                // Get the final HTML content, fall back to simple HTML if this fails
                let html = match tab.get_content() {
                    Ok(content) => content,
                    Err(e) => {
                        if let Some(html) = simple_html {
                            html
                        } else {
                            return Err(format!("Failed to get page content: {}", e));
                        }
                    }
                };

                // Try to close tab
                match tab.get_target_info() {
                    Ok(_) => {
                        if let Err(_e) = tab.close(false) {
                            // Ignore WebSocket errors during cleanup
                        }
                    }
                    Err(_) => {}
                }

                // Force browser cleanup explicitly
                drop(browser);

                Ok(html)
            }),
        )
        .await
        {
            Ok(task_result) => match task_result {
                Ok(html_result) => html_result,
                Err(e) => return Err(format!("Task join error: {}", e)),
            },
            Err(_) => {
                return Err(format!(
                    "Browser fetch timed out after {} seconds",
                    timeout_duration.as_secs()
                ));
            }
        };

        match html {
            Ok(content) => Ok(content),
            Err(e) => Err(e),
        }
    }

    /// Helper function to wait for document ready state
    pub fn wait_for_document_ready(tab: &headless_chrome::Tab) -> Result<(), String> {
        let script = r#"
    new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve(true);
            return;
        }
        
        document.addEventListener('readystatechange', () => {
            if (document.readyState === 'complete') {
                resolve(true);
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
    pub fn scroll_page_for_lazy_loading(tab: &headless_chrome::Tab) -> Result<(), String> {
        let script = r#"
    new Promise((resolve) => {
        // Helper to wait a bit between scrolling operations
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        
        // Get the maximum height of the page
        const getMaxHeight = () => Math.max(
            document.body.scrollHeight, 
            document.documentElement.scrollHeight
        );
        
        // Function to perform scrolling with waits
        const doScrolling = async () => {
            let maxHeight = getMaxHeight();
            
            // More granular scrolling to ensure all lazy elements load
            const positions = [
                0,                    // Top
                maxHeight * 0.1,      // 10% down
                maxHeight * 0.25,     // 25% down
                maxHeight * 0.5,      // 50% down
                maxHeight * 0.75,     // 75% down
                maxHeight * 0.9,      // 90% down
                maxHeight,            // Bottom
                maxHeight * 0.5,      // Back to middle
                0                     // Back to top
            ];
            
            // Execute scrolls with small waits between each position
            for (const pos of positions) {
                window.scrollTo(0, pos);
                await wait(100); // Reduced wait between scrolls
            }
            
            // Check if content height has changed after scrolling
            const newHeight = getMaxHeight();
            
            // If height increased significantly, scroll again
            if (newHeight > maxHeight * 1.2) {
                // New positions based on new height
                const newPositions = [
                    maxHeight,        // Original bottom
                    newHeight * 0.5,  // New middle  
                    newHeight,        // New bottom
                    0                 // Back to top
                ];
                
                for (const pos of newPositions) {
                    window.scrollTo(0, pos);
                    await wait(100); // Reduced wait
                }
            }
        };
        
        // Run the scroll function and resolve when done
        doScrolling().then(() => resolve(true));
    })
    "#;

        match tab.evaluate(script, true) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Scroll operation failed: {}", e)),
        }
    }

    /// Helper function to interact with interactive elements like accordions, dropdowns, etc.
    pub fn interact_with_interactive_elements(
        tab: &headless_chrome::Tab,
    ) -> Result<serde_json::Value, String> {
        let script = r#"
    new Promise(async (resolve) => {
        // Helper to wait for a brief moment (to let page update after interactions)
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        
        // Set a timeout to prevent hanging
        const timeout = setTimeout(() => {
            resolve({
                error: 'Interaction timed out',
                accordionsExpanded: 0,
                dropdownsClicked: 0,
                tabsClicked: 0,
                paginationClicks: 0,
                inputsClicked: 0,
                hoveredElements: 0,
                heightChange: 0
            });
        }, 20000); // 20 second timeout
        
        // Track original page height for comparison later
        const initialHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        
        try {
            // --- COMMON INTERACTIVE ELEMENTS ---
            
            // 1. Click all accordion elements (commonly used for FAQ, docs, etc)
            const accordionSelectors = [
                // Common accordion buttons/headers
                'button[aria-expanded="false"]',
                '.accordion-button.collapsed',
                '.accordion-header',
                '.accordion-title',
                '.accordion__button',
                '.accordion-toggle',
                '.expand-button',
                '[data-toggle="collapse"]',
                '[data-bs-toggle="collapse"]',
                '.accordion [role="button"]',
                'details:not([open]) summary',
                // Material Design and other frameworks
                '.MuiAccordionSummary-root',
                '.v-expansion-panel-header',
                '.chakra-accordion__button[aria-expanded="false"]',
                '.ant-collapse-header'
            ];
            
            // Combine selectors for a single query
            let allAccordions = [];
            for (const selector of accordionSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        allAccordions = [...allAccordions, ...Array.from(elements)];
                    }
                } catch (e) {}
            }
            
            // Click each accordion element
            for (const element of allAccordions) {
                try {
                    element.click();
                    await wait(100); // Reduced wait time 
                } catch (e) {}
            }
            
            // 2. Open all dropdown menus
            const dropdownSelectors = [
                // Bootstrap and common frameworks
                '.dropdown-toggle',
                '[data-toggle="dropdown"]',
                '[data-bs-toggle="dropdown"]',
                '.dropdown-button',
                // UI libraries
                '.MuiSelect-select',
                '.v-select__slot',
                '.chakra-select',
                '.ant-select-selector',
                '.select-trigger',
                // Common custom dropdowns
                '[aria-haspopup="true"]',
                '[role="combobox"]',
                '.menu-trigger',
                'button.dropdown'
            ];
            
            // Handle dropdowns
            let allDropdowns = [];
            for (const selector of dropdownSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        allDropdowns = [...allDropdowns, ...Array.from(elements)];
                    }
                } catch (e) {}
            }
            
            // Click each dropdown element
            for (const element of allDropdowns) {
                try {
                    element.click();
                    await wait(150); // Slightly longer wait for dropdown animation
                    // Click again to close if needed (avoid leaving open dropdowns)
                    element.click();
                    await wait(50); // Minimal wait for closing animation
                } catch (e) {}
            }
            
            // 3. Expand all "Show More" / "Read More" buttons
            const expandSelectors = [
                // Common "show more" buttons
                'button:not([aria-expanded="true"]):not([disabled]).show-more', 
                'button:not([aria-expanded="true"]):not([disabled]).read-more',
                'button:not([aria-expanded="true"]):not([disabled]).expand',
                'button:not([aria-expanded="true"]):not([disabled]).see-more',
                'a.show-more', 'a.read-more', 'a.expand', 'a.see-more',
                '[id*="show-more"]',
                '[id*="read-more"]',
                '[class*="show-more"]',
                '[class*="read-more"]',
                '[data-more]',
                // Text-based buttons using text content instead of :contains
                'button', // We'll filter these by text content later
                'a[href]' // We'll filter these by text content later
            ];
            
            // Array to collect all "show more" buttons across different selectors
            let allShowMoreButtons = [];
            
            for (const selector of expandSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    
                    // For generic button and a[href] selectors, filter by text content
                    if (selector === 'button' || selector === 'a[href]') {
                        // Filter by text content for these generic selectors
                        const textPhrases = ['show more', 'read more', 'view more', 'load more', 'see more', 'expand'];
                        const filteredElements = Array.from(elements).filter(el => {
                            const text = (el.textContent || '').toLowerCase().trim();
                            return textPhrases.some(phrase => text.includes(phrase));
                        });
                        
                        allShowMoreButtons = [...allShowMoreButtons, ...filteredElements];
                    } else {
                        // Add all elements for specific selectors
                        allShowMoreButtons = [...allShowMoreButtons, ...Array.from(elements)];
                    }
                } catch (e) {}
            }
            
            // Remove duplicates (same element might be matched by multiple selectors)
            allShowMoreButtons = [...new Set(allShowMoreButtons)];
            
            // Click all show more buttons
            for (const button of allShowMoreButtons) {
                try {
                    button.click();
                    await wait(200); // Wait for content to expand but reduced
                } catch (e) {}
            }
            
            // 4. Open all tab panels (very common in documentation)
            const tabSelectors = [
                // Common tab selectors
                '.nav-tabs .nav-link:not(.active)',
                '.nav-pills .nav-link:not(.active)',
                '[role="tab"]:not([aria-selected="true"])',
                '.tab:not(.active)',
                '.tabs__link:not(.active)',
                // UI frameworks
                '.MuiTab-root:not(.Mui-selected)',
                '.v-tab:not(.v-tab--active)',
                '.chakra-tabs__tab:not([aria-selected="true"])',
                '.ant-tabs-tab:not(.ant-tabs-tab-active)'
            ];
            
            let allTabs = [];
            for (const selector of tabSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        allTabs = [...allTabs, ...Array.from(elements)];
                    }
                } catch (e) {}
            }
            
            // Click all inactive tabs to activate their content
            for (const tab of allTabs) {
                try {
                    tab.click();
                    await wait(200); // Reduced wait for tab content to load
                } catch (e) {}
            }
            
            // 5. Add hover state to elements that might reveal content on hover
            const hoverSelectors = [
                '.has-dropdown', 
                '.dropdown-trigger', 
                '.has-submenu',
                '.menu-item-has-children',
                '[data-hover="true"]',
                '[aria-haspopup="true"]',
                // Common menu containers
                'nav li', '.nav-item', '.menu-item'
            ];
            
            // Track hover count
            let hoveredCount = 0;
            
            // Apply hover styles directly via JavaScript
            for (const selector of hoverSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        for (const el of elements) {
                            hoveredCount++;
                            try {
                                // Apply hover styles directly
                                el.classList.add('hover');
                                el.classList.add('is-hover');
                                el.classList.add('show');
                                el.classList.add('is-active');
                                
                                // Set :hover state via inline style
                                const originalDisplay = el.style.display;
                                const originalVisibility = el.style.visibility;
                                
                                // Apply hover styles via JavaScript
                                el.style.setProperty('--hover', 'true');
                                el.setAttribute('data-is-hover', 'true');
                                
                                // Try to force any children to be visible
                                const children = el.querySelectorAll('.dropdown-menu, .sub-menu, .submenu, .dropdown-content');
                                children.forEach(child => {
                                    child.style.display = 'block';
                                    child.style.visibility = 'visible';
                                    child.style.opacity = '1';
                                    child.style.maxHeight = 'none';
                                    child.classList.add('show');
                                    child.classList.add('active');
                                    child.classList.add('open');
                                });
                                
                                await wait(25); // Minimal wait to let styles apply
                                
                                // Restore original styles to avoid side effects
                                setTimeout(() => {
                                    // Restore only if we changed them
                                    if (originalDisplay) el.style.display = originalDisplay;
                                    if (originalVisibility) el.style.visibility = originalVisibility;
                                }, 500); // Reduced timeout
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
            
            // 6. Close any modals, popups, or overlays that might block content
            const modalCloseSelectors = [
                // Common modal close buttons
                '.modal .close', '.modal .btn-close', '.modal-close',
                '[aria-label="Close"]', '[data-dismiss="modal"]',
                '.popup-close', '.cookie-banner .close', '.cookie-notice .close',
                // UI frameworks
                '.MuiDialog-root .MuiIconButton-root', 
                '.v-dialog .v-btn--icon', 
                '.chakra-modal__close-btn'
            ];
            
            // Try to close all modals
            for (const selector of modalCloseSelectors) {
                try {
                    const closeButtons = document.querySelectorAll(selector);
                    if (closeButtons.length > 0) {
                        for (const button of closeButtons) {
                            try {
                                button.click();
                                await wait(50); // Minimal wait
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
            
            // 7. Handle forms and pagination elements
            try {
                // Find and interact with pagination elements
                const paginationSelectors = [
                    '.pagination .page-item:not(.active) .page-link',
                    '.pagination__link:not(.pagination__link--active)',
                    '[aria-label="Next page"]',
                    '[aria-label="Next"]',
                    '.next-page',
                    '.next-button'
                ];
                
                // Find and click non-active pagination elements (limited to first 2)
                let paginationElements = [];
                for (const selector of paginationSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            paginationElements = [...paginationElements, ...Array.from(elements)];
                        }
                    } catch (e) {}
                }
                
                // Show content behind the first few pages of pagination
                // Limit to just 2 page clicks to avoid clicking too many pages
                const paginationLimit = 2;
                if (paginationElements.length > 0) {
                    for (let i = 0; i < Math.min(paginationLimit, paginationElements.length); i++) {
                        try {
                            paginationElements[i].click();
                            
                            // Allow some time for page content to load after pagination click
                            await wait(500); // Reduced wait but still necessary
                            
                            // Scroll and interact with elements on each paginated view
                            // Scroll again after clicking pagination
                            const positions = [0, document.body.scrollHeight * 0.5, document.body.scrollHeight];
                            positions.forEach(pos => window.scrollTo(0, pos));
                            
                            // Wait for content to load
                            await wait(200); // Reduced but still necessary
                        } catch (e) {}
                    }
                }
                
                // Handle checkbox and radio inputs - make them visible
                // Some documentation systems show different content based on selected options
                const inputSelectors = ['input[type="radio"]:not(:checked)', 'input[type="checkbox"]:not(:checked)'];
                let inputElements = [];
                
                for (const selector of inputSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            inputElements = [...inputElements, ...Array.from(elements)]; // Get all inputs
                        }
                    } catch (e) {}
                }
                
                // Click inputs to reveal hidden content
                if (inputElements.length > 0) {
                    for (const input of inputElements) {
                        try {
                            input.click();
                            await wait(150); // Reduced wait
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            
            // Final wait to ensure all dynamic content has loaded
            await wait(300); // Reduced but still needed
            
            // Check if page height changed significantly (indication that we revealed content)
            const finalHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            const heightChange = finalHeight - initialHeight;
            
            // Clear the timeout since we're done
            clearTimeout(timeout);
            
            resolve({
                accordionsExpanded: allAccordions.length,
                dropdownsClicked: allDropdowns.length,
                tabsClicked: allTabs.length,
                paginationClicks: paginationElements ? Math.min(paginationLimit, paginationElements.length) : 0,
                inputsClicked: inputElements ? inputElements.length : 0,
                hoveredElements: hoveredCount || 0,
                heightChange: heightChange
            });
        } catch (error) {
            // Clear the timeout since we're exiting
            clearTimeout(timeout);
            
            resolve({
                error: error.toString(),
                accordionsExpanded: 0,
                dropdownsClicked: 0,
                tabsClicked: 0,
                paginationClicks: 0,
                inputsClicked: 0,
                hoveredElements: 0,
                heightChange: 0
            });
        }
    })
    "#;

        // Use the standard evaluate method since evaluate_with_timeout is not available
        // The tab object already has an internal timeout setting
        match tab.evaluate(script, true) {
            Ok(result) => {
                // Convert the result to JSON
                if let Some(value) = result.value {
                    match serde_json::from_str::<serde_json::Value>(&value.to_string()) {
                        Ok(json) => Ok(json),
                        Err(e) => Err(format!(
                            "Failed to parse interactive elements result: {}",
                            e
                        )),
                    }
                } else {
                    // Return a default success rather than an error
                    Ok(serde_json::json!({
                        "info": "Completed with empty result",
                        "accordionsExpanded": 0,
                        "dropdownsClicked": 0,
                        "tabsClicked": 0,
                        "heightChange": 0
                    }))
                }
            }
            Err(e) => {
                // Check if it's a timeout error
                if e.to_string().contains("timeout") {
                    Err(format!("Interactive elements interaction timed out: {}", e))
                } else {
                    Err(format!("Interactive elements interaction failed: {}", e))
                }
            }
        }
    }
    // Additional browser-related methods would be added here
}
