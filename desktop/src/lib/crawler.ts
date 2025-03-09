import { addURL, updateURLContent, updateURLStatus, getURLByUrl, getProxies } from './db';
import TurndownService from 'turndown';

// Global state to track if crawling is in progress
let isCrawling = false;
let crawlingStopped = false;
let activeCrawlUrls: string[] = [];
// Global URL cache to prevent duplicate crawling across concurrent processes
const globalVisitedUrls = new Set<string>();
// Proxy rotation queue
const proxyQueue: string[] = [];
// Set to track which proxies are currently in use (to avoid duplicates in the queue)
const activeProxies = new Set<string>();

// Function to stop any active crawling
export const stopCrawling = (): void => {
  console.log("Stopping all crawling activities");
  crawlingStopped = true;
  isCrawling = false;
  activeCrawlUrls = [];
  console.log("Crawling has been stopped. Current urls being processed will finish.");
};

// Function to reset crawler state after stopping
export const resetCrawlerState = (): void => {
  console.log("Resetting crawler state");
  crawlingStopped = false;
  isCrawling = false;
  activeCrawlUrls = [];
  globalVisitedUrls.clear();
};

// Function to check if crawling is in progress
export const getCrawlingStatus = (): { isCrawling: boolean, activeCrawlUrls: string[] } => {
  // Only report as crawling if we have active URLs or the flag is explicitly set
  const actuallyIsCrawling = isCrawling && (activeCrawlUrls.length > 0 || crawlingStopped);
  
  // If we're not actually crawling but the flag says we are, reset it
  if (!actuallyIsCrawling && isCrawling) {
    console.log("No active URLs but crawling flag was set. Resetting crawler state.");
    isCrawling = false;
  }
  
  return { 
    isCrawling: actuallyIsCrawling, 
    activeCrawlUrls: [...activeCrawlUrls] 
  };
};

// Interface for crawler configuration
export interface CrawlerConfig {
  startUrl: string;
  prefixPath: string;
  antiPaths: string[];
  antiKeywords: string[];
  sessionId: number;
  maxConcurrentRequests?: number; // Optional param for controlling parallelism
  unlimitedParallelism?: boolean; // Optional param to enable unlimited parallelism
}

// Function to check if URL should be crawled based on config
export const shouldCrawlURL = (url: string, config: CrawlerConfig): boolean => {
  // Check if URL is null, undefined, or empty
  if (!url || url.trim() === '') {
    console.log(`Rejecting invalid URL: ${url}`);
    return false;
  }

  try {
    // Try to parse the URL to validate it
    new URL(url);
  } catch (e) {
    console.log(`Rejecting malformed URL: ${url}`);
    return false;
  }
  
  // Check if URL starts with the prefix path
  if (!url.startsWith(config.prefixPath)) {
    console.log(`URL not matching prefix. URL: ${url}, Prefix: ${config.prefixPath}`);
    return false;
  }
  
  // Check if URL contains any anti-paths
  if (config.antiPaths.length > 0 && config.antiPaths.some(path => {
    if (path && path.trim() !== '' && url.includes(path)) {
      console.log(`URL contains excluded path. URL: ${url}, Excluded Path: ${path}`);
      return true;
    }
    return false;
  })) {
    return false;
  }
  
  // Check if URL contains any anti-keywords
  if (config.antiKeywords.length > 0 && config.antiKeywords.some(keyword => {
    if (keyword && keyword.trim() !== '' && url.includes(keyword)) {
      console.log(`URL contains excluded keyword. URL: ${url}, Excluded Keyword: ${keyword}`);
      return true;
    }
    return false;
  })) {
    return false;
  }
  
  return true;
};

// Function to extract links from HTML content
export const extractLinks = (html: string, baseUrl: string): string[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const links = Array.from(doc.querySelectorAll('a[href]'))
    .map(link => {
      const href = link.getAttribute('href');
      if (!href) return null;
      
      try {
        // Convert relative URLs to absolute
        return new URL(href, baseUrl).href;
      } catch (e) {
        return null;
      }
    })
    .filter((link): link is string => link !== null);
  
  // Return unique links
  return [...new Set(links)];
};

// Function to initialize proxy queue
export const initializeProxyQueue = async () => {
  // Clear existing queue
  proxyQueue.length = 0;
  activeProxies.clear();
  
  // Get all available proxies from DB
  const proxies = await getProxiesForQueue();
  if (proxies && proxies.length > 0) {
    // Add all proxies to queue
    proxies.forEach(proxy => {
      if (proxy.url && !proxyQueue.includes(proxy.url)) {
        proxyQueue.push(proxy.url);
      }
    });
    console.log(`Initialized proxy queue with ${proxyQueue.length} proxies`);
  } else {
    console.log("No proxies found in database");
  }
};

// Helper function to get all proxies
const getProxiesForQueue = async () => {
  try {
    const proxies = await getProxies();
    return proxies.filter(p => p.status === 'active');
  } catch (error) {
    console.error("Error getting proxies for queue:", error);
    return [];
  }
};

// Function to fetch HTML content from a URL with headless Chrome
export const fetchWithProxy = async (url: string): Promise<string> => {
  try {
    // Get a proxy from the queue or refill if empty
    let proxyUrl: string | undefined;
    
    // If queue is empty, try to refill it
    if (proxyQueue.length === 0) {
      await initializeProxyQueue();
    }
    
    if (proxyQueue.length > 0) {
      // Pop from the left (shift)
      proxyUrl = proxyQueue.shift();
      console.log(`Using proxy ${proxyUrl} for ${url}`);
      
      // Mark as active
      if (proxyUrl) {
        activeProxies.add(proxyUrl);
      }
      
      // We'll add it back to the queue after use
      setTimeout(() => {
        if (proxyUrl) {
          // Remove from active set
          activeProxies.delete(proxyUrl);
          
          // Add back to end of queue
          if (!proxyQueue.includes(proxyUrl)) {
            proxyQueue.push(proxyUrl);
            console.log(`Returned proxy ${proxyUrl} to queue`);
          }
        }
      }, 5000); // 5 second delay before reusing
    } else {
      console.log("No proxies available, proceeding without proxy");
    }
    
    // Always use headless browser for all sites to handle JavaScript and avoid CORS issues
    // In the future, we could actually use the proxy in a headless browser session
    return await fetchWithHeadlessBrowser(url);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    
    // Fallback to regular fetch if headless browser fails
    console.log(`Falling back to regular fetch for ${url}`);
    try {
      // Fallback to direct fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      }
      
      return await response.text();
    } catch (fallbackError) {
      console.error(`Fallback fetch also failed for ${url}:`, fallbackError);
      throw new Error(`Failed to fetch ${url} with both headless browser and direct fetch: ${error}`);
    }
  }
};

/**
 * Fetch a URL using a headless browser to handle JavaScript-rendered content
 */
export const fetchWithHeadlessBrowser = async (url: string): Promise<string> => {
  try {
    console.log(`Using headless browser to fetch: ${url}`);
    
    try {
      // Use Tauri invoke to call the Rust function
      const { invoke } = await import('@tauri-apps/api/core');
      const html = await invoke('fetch_with_headless_browser', { url });
      
      if (!html || typeof html !== 'string' || html.length < 10) {
        throw new Error(`Empty or invalid response from headless browser fetch for ${url}`);
      }
      
      console.log(`Successfully fetched content from ${url} (${html.length} bytes)`);
      return html as string;
    } catch (tauriError) {
      console.error(`Tauri command error: ${tauriError}`);
      throw new Error(`Failed to fetch ${url} with headless browser. Error: ${tauriError}`);
    }
  } catch (error) {
    console.error(`Error fetching with headless browser: ${url}`, error);
    throw error;
  }
};

/**
 * Convert HTML to Markdown using Rust implementation
 */
export const convertToMarkdown = async (html: string): Promise<string> => {
  console.log("================================");
  console.log("HTML TO MARKDOWN CONVERSION");
  console.log("================================");
  console.log(`HTML content length: ${html.length} characters`);
  console.log(`HTML content preview: ${html.substring(0, 100)}...`);
  
  const startTime = performance.now();
  
  try {
    // Use the Rust implementation via Tauri command
    console.log("Using Rust implementation for HTML-to-Markdown conversion");
    
    try {
      // Import Tauri invoke
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Call the Rust function
      const markdown = await invoke('convert_html_to_markdown', { html }) as string;
      
      const endTime = performance.now();
      console.log(`✅ HTML to Markdown conversion completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`Markdown length: ${markdown.length} characters`);
      console.log(`Markdown preview: ${markdown.substring(0, 100)}...`);
      
      return markdown;
    } catch (tauriError) {
      console.error(`Tauri command error:`, tauriError);
      
      // Fallback to JS implementation if Rust version fails
      console.log("Falling back to JS implementation due to error");
      return fallbackConvertHtmlToMarkdown(html);
    }
  } catch (error) {
    const endTime = performance.now();
    console.error(`❌ HTML to Markdown conversion FAILED in ${(endTime - startTime).toFixed(2)}ms:`, error);
    throw error;
  }
};

/**
 * Fallback JavaScript HTML to Markdown conversion
 * Only used if the Rust implementation fails
 */
function fallbackConvertHtmlToMarkdown(html: string): string {
  console.log("Converting HTML to Markdown with Turndown (fallback)");
  // Create an instance of TurndownService
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    hr: '---',
    bulletListMarker: '-'
  });
  
  // Add performance improvement rules
  turndownService.remove(['script', 'style', 'noscript', 'iframe']);
  
  // Directly use turndown
  return turndownService.turndown(html);
};

// Main crawler function
export const crawlURL = async (url: string, config: CrawlerConfig): Promise<string[]> => {
  try {
    // Check if we already have this URL in the DB before processing
    const existingUrl = await getURLByUrl(config.sessionId, url);
    
    // If URL already exists and is already processed, don't reprocess it
    if (existingUrl && (existingUrl.status === 'crawled' || existingUrl.status === 'processed' || existingUrl.status === 'error')) {
      console.log(`Skipping already processed URL: ${url} (status: ${existingUrl.status})`);
      return [];
    }
    
    // Add or update URL in database with pending status
    if (existingUrl && existingUrl.id) {
      await updateURLStatus(existingUrl.id, 'pending');
    } else {
      await addURL({
        session_id: config.sessionId,
        url,
        status: 'pending'
      });
    }
    
    // Fetch HTML content
    const html = await fetchWithProxy(url);
    
    // Convert to markdown (now fully async with Rust implementation)
    const markdown = await convertToMarkdown(html);
    
    // Update URL in database with content
    const urlObj = await getURLByUrl(config.sessionId, url);
    if (urlObj && urlObj.id) {
      await updateURLContent(urlObj.id, html, markdown);
      await updateURLStatus(urlObj.id, 'crawled');
    }
    
    // Extract links for further crawling
    const links = extractLinks(html, url);
    
    // Filter links based on crawler config
    const validLinks = links.filter(link => shouldCrawlURL(link, config));
    
    console.log(`Found ${links.length} links, ${validLinks.length} match criteria for URL: ${url}`);
    
    return validLinks;
  } catch (error) {
    console.error(`Error crawling ${url}:`, error);
    const urlObj = await getURLByUrl(config.sessionId, url);
    if (urlObj && urlObj.id) {
      await updateURLStatus(urlObj.id, 'error');
    }
    return [];
  }
};

// Function to start the crawler with a given configuration
export const startCrawler = async (config: CrawlerConfig): Promise<void> => {
  // Check if crawling was stopped - don't restart if requested to stop
  if (crawlingStopped) {
    console.log("Crawling was previously stopped. Not starting new crawler. Reset required.");
    return;
  }
  
  // Log important configuration details at start
  console.log("----------- CRAWLER CONFIGURATION -----------");
  console.log(`Start URL: ${config.startUrl}`);
  console.log(`Prefix Path: ${config.prefixPath}`);
  console.log(`Anti-Paths: ${config.antiPaths.join(', ')}`);
  console.log(`Anti-Keywords: ${config.antiKeywords.join(', ')}`);
  console.log(`Unlimited Parallelism: ${config.unlimitedParallelism}`);
  console.log(`Session ID: ${config.sessionId}`);
  console.log("-------------------------------------------");
  
  // Set crawling state
  isCrawling = true;
  crawlingStopped = false;
  
  // Check if we need to reset global visited URLs 
  // Only reset when starting a new crawler session, not when using multiple parallel crawlers
  if (activeCrawlUrls.length === 0) {
    console.log("Starting new crawler session, clearing global visited URLs cache");
    globalVisitedUrls.clear();
    
    // Initialize proxy queue if this is a new crawler session
    await initializeProxyQueue();
  } else {
    console.log(`Adding to existing crawler session with ${globalVisitedUrls.size} known URLs`);
  }
  
  // Set up parallelism
  const DEFAULT_CONCURRENCY = 4; // Default to 4 parallel requests
  const MAX_POSSIBLE_CONCURRENT = 1000; // Setting this to a very high number, effectively removing the limit
  
  // Determine concurrency based on config
  let concurrency = DEFAULT_CONCURRENCY;
  
  if (config.unlimitedParallelism) {
    // Use a truly high number for unlimited parallelism
    concurrency = 1000; 
    console.log(`Crawler using unlimited parallelism (${concurrency} concurrent requests)`);
  } else if (config.maxConcurrentRequests) {
    // Use specified concurrency without capping
    concurrency = config.maxConcurrentRequests;
    console.log(`Crawler using ${concurrency} concurrent requests`);
  } else {
    console.log(`Crawler using default concurrency: ${concurrency} concurrent requests`);
  }
  
  // Use a Set for queue to ensure URLs are unique
  const queueSet = new Set<string>();
  // Only add the startUrl if it passes our crawling criteria
  if (shouldCrawlURL(config.startUrl, config)) {
    queueSet.add(config.startUrl);
  } else {
    console.warn(`Starting URL ${config.startUrl} does not match crawling criteria. Check your configuration.`);
    return; // Exit early if the start URL doesn't match the criteria
  }
  
  // Convert to array for easier manipulation
  const queue: string[] = Array.from(queueSet);
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  
  // Add the starting URL to database
  await addURL({
    session_id: config.sessionId,
    url: config.startUrl,
    status: 'pending'
  });
  
  // First check the DB for any URLs that are already crawled
  // to avoid recrawling them
  console.log("Loading already crawled URLs from database...");
  try {
    // Import the module for getting URLs
    const { getURLs } = await import('./db');
    
    // Get all URLs from the database for this session
    const existingUrls = await getURLs(config.sessionId);
    
    // Use a Set for the queue to ensure uniqueness
    const queueSet = new Set<string>();
    
    // Always add start URL to the queue, regardless of tracking status
    console.log(`Always adding start URL to queue: ${config.startUrl}`);
    queueSet.add(config.startUrl);
    
    // Add them to the appropriate sets
    let pendingCount = 0;
    for (const urlObj of existingUrls) {
      // Check if it's the start URL - we always want to crawl the start URL
      const isStartUrl = (urlObj.url === config.startUrl);
      
      // Only add to global tracking if not the start URL
      if (!isStartUrl) {
        globalVisitedUrls.add(urlObj.url);
      }
      
      if ((urlObj.status === 'crawled' || urlObj.status === 'error' || urlObj.status === 'processed') && !isStartUrl) {
        // If already processed and not the start URL, just mark as visited and don't recrawl
        console.log(`Skipping already processed URL: ${urlObj.url} (status: ${urlObj.status})`);
        visited.add(urlObj.url);
      } else if (urlObj.status === 'pending' || isStartUrl) {
        // Only add to queue if it passes the criteria check
        if (shouldCrawlURL(urlObj.url, config)) {
          console.log(`Adding pending URL to queue: ${urlObj.url}`);
          queueSet.add(urlObj.url);
          pendingCount++;
        } else {
          console.log(`Skipping pending URL that doesn't match criteria: ${urlObj.url}`);
          // Update status to avoid processing in the future
          try {
            if (urlObj.id) {
              await updateURLStatus(urlObj.id, 'error');
            }
          } catch (err) {
            console.error(`Error updating URL status: ${urlObj.url}`, err);
          }
        }
      }
    }
    
    // Convert the queueSet to an array for processing
    const queue: string[] = Array.from(queueSet);
    
    console.log(`Loaded ${visited.size} processed and ${pendingCount} pending URLs from database`);
    
    // Debugging: Check if startUrl is in the queue
    if (queue.includes(config.startUrl)) {
      console.log(`Start URL ${config.startUrl} is in the queue`);
    } else {
      console.log(`Start URL ${config.startUrl} is NOT in the queue!`);
      
      // Force add the start URL to the queue if it's not there
      if (shouldCrawlURL(config.startUrl, config)) {
        console.log(`Forcing start URL ${config.startUrl} into the queue`);
        queue.push(config.startUrl);
      } else {
        console.log(`Cannot add start URL ${config.startUrl} to queue because it doesn't match criteria`);
      }
    }
  } catch (error) {
    console.error("Error loading existing URLs:", error);
  }
  
  console.log(`Starting crawler with concurrency of ${concurrency}`);
  
  // Process queue with parallelism
  while ((queue.length > 0 || inProgress.size > 0) && !crawlingStopped) {
    // Log crawler status periodically
    if (queue.length > 0 || inProgress.size > 0) {
      console.log(`Crawler status: ${inProgress.size} in progress, ${queue.length} queued, ${visited.size} visited, prefix: ${config.prefixPath}`);
      
      // Detailed logging for in-progress URLs
      if (inProgress.size > 0) {
        console.log(`In progress URLs: ${Array.from(inProgress).slice(0, 3).join(', ')}${inProgress.size > 3 ? ` and ${inProgress.size - 3} more...` : ''}`);
      }
    }
    
    // Fill the processing queue up to concurrency limit
    while (inProgress.size < concurrency && queue.length > 0 && !crawlingStopped) {
      const url = queue.shift()!;
      
      // Check if this is the start URL - special case
      const isStartUrl = (url === config.startUrl);
      
      // Skip if already visited or in progress - but always process the start URL
      if (!isStartUrl && (visited.has(url) || inProgress.has(url) || globalVisitedUrls.has(url))) {
        console.log(`Skipping already visited/in-progress URL: ${url}`);
        continue;
      }
      
      // Double check that URL still matches criteria (could have changed since being added to queue)
      if (!shouldCrawlURL(url, config)) {
        console.log(`URL no longer matches criteria, skipping: ${url}`);
        visited.add(url);
        globalVisitedUrls.add(url);
        continue;
      }
      
      // Double-check URL in database to avoid race conditions
      try {
        const urlObj = await getURLByUrl(config.sessionId, url);
        
        // Check if this is the start URL - special case
        const isStartUrl = (url === config.startUrl);

        // If URL exists and is already processed, mark as visited and skip (unless it's the start URL)
        if (!isStartUrl && urlObj && (urlObj.status === 'crawled' || urlObj.status === 'error' || urlObj.status === 'processed')) {
          console.log(`Skipping already processed URL from DB check: ${url} (status: ${urlObj.status})`);
          visited.add(url);
          globalVisitedUrls.add(url);
          continue;
        }
        
        // If it's the start URL, always process it regardless of status
        if (isStartUrl) {
          console.log(`Processing start URL regardless of status: ${url}`);
        }
      } catch (err) {
        console.error(`Error checking URL status in DB: ${url}`, err);
      }
      
      // Mark as in progress in both local and global state
      inProgress.add(url);
      visited.add(url);
      globalVisitedUrls.add(url);
      
      // Process URL in the background (don't await)
      (async (currentUrl) => {
        try {
          // Add to active crawl URLs
          activeCrawlUrls.push(currentUrl);
          
          // Check if we should stop crawling
          if (crawlingStopped) {
            console.log(`Skipping crawl of ${currentUrl} due to stop request`);
            inProgress.delete(currentUrl);
            const urlIndex = activeCrawlUrls.indexOf(currentUrl);
            if (urlIndex !== -1) activeCrawlUrls.splice(urlIndex, 1);
            return;
          }
          
          console.log(`Crawling ${currentUrl}`);
          const newLinks = await crawlURL(currentUrl, config);
          
          // If crawling has been stopped, don't enqueue new links
          if (!crawlingStopped) {
            // Add valid links to queue
            for (const link of newLinks) {
              // Skip if we already know about this URL
              if (visited.has(link) || inProgress.has(link) || globalVisitedUrls.has(link) || queue.includes(link)) {
                console.log(`Skipping already known URL: ${link}`);
                continue;
              }
              
              // Check if URL exists in database before adding
              try {
                const urlObj = await getURLByUrl(config.sessionId, link);
                
                // If URL exists in any state, mark it as visited and don't add to queue again
                if (urlObj) {
                  console.log(`URL exists in DB with status ${urlObj.status}: ${link}`);
                  visited.add(link);
                  globalVisitedUrls.add(link);
                  
                  // Only add to queue if it's still pending
                  if (urlObj.status === 'pending') {
                    console.log(`Adding existing pending URL to queue: ${link}`);
                    if (!queue.includes(link)) {
                      queue.push(link);
                    }
                  } else {
                    console.log(`Skipping URL with status ${urlObj.status}: ${link}`);
                  }
                  continue;
                }
              } catch (err) {
                console.error(`Error checking URL status in DB: ${link}`, err);
              }
              
              // If we get here, URL is new and not in DB yet
              console.log(`Adding new URL to queue: ${link}`);
              
              // Check if it's in queue before adding
              if (!queue.includes(link)) {
                queue.push(link);
                
                // Add to database with pending status
                try {
                  await addURL({
                    session_id: config.sessionId,
                    url: link,
                    status: 'pending'
                  });
                } catch (err) {
                  console.error(`Error adding URL to database: ${link}`, err);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error processing ${currentUrl}:`, error);
        } finally {
          // Always remove from in-progress list
          inProgress.delete(currentUrl);
          
          // Remove from active crawl URLs
          const urlIndex = activeCrawlUrls.indexOf(currentUrl);
          if (urlIndex !== -1) activeCrawlUrls.splice(urlIndex, 1);
        }
      })(url);
    }
    
    // Check if the crawler has been stopped before waiting
    if (crawlingStopped) break;
    
    // Wait a bit before checking the queue again
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Reset crawling state
  isCrawling = false;
  activeCrawlUrls = [];
  
  // If crawling was stopped, log it
  if (crawlingStopped) {
    console.log("Crawling was stopped manually");
    crawlingStopped = false;
  }
  
  console.log(`Crawling complete, visited ${visited.size} URLs`);
};