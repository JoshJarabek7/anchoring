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
  // Check if URL starts with the prefix path
  if (!url.startsWith(config.prefixPath)) {
    return false;
  }
  
  // Check if URL contains any anti-paths
  if (config.antiPaths.some(path => url.includes(path))) {
    return false;
  }
  
  // Check if URL contains any anti-keywords
  if (config.antiKeywords.some(keyword => url.includes(keyword))) {
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
    // Add URL to database with pending status
    await addURL({
      session_id: config.sessionId,
      url,
      status: 'pending'
    });
    
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
  const MAX_POSSIBLE_CONCURRENT = 16; // Hard limit for safety
  
  // Determine concurrency based on config
  let concurrency = DEFAULT_CONCURRENCY;
  
  if (config.unlimitedParallelism) {
    // Use a high number but not truly unlimited, for safety
    concurrency = 32; 
    console.log(`Crawler using unlimited parallelism (${concurrency} concurrent requests)`);
  } else if (config.maxConcurrentRequests) {
    // Use specified concurrency, but cap at maximum
    concurrency = Math.min(config.maxConcurrentRequests, MAX_POSSIBLE_CONCURRENT);
    console.log(`Crawler using ${concurrency} concurrent requests`);
  } else {
    console.log(`Crawler using default concurrency: ${concurrency} concurrent requests`);
  }
  
  // Queue of URLs to crawl
  const queue: string[] = [config.startUrl];
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
    
    // Get all URLs that already have status 'crawled' or 'error' or 'processed'
    const existingUrls = await getURLs(config.sessionId);
    
    // Add them to the visited sets to avoid recrawling
    for (const urlObj of existingUrls) {
      if (urlObj.status === 'crawled' || urlObj.status === 'error' || urlObj.status === 'processed') {
        console.log(`Skipping already processed URL: ${urlObj.url}`);
        visited.add(urlObj.url);
        globalVisitedUrls.add(urlObj.url);
      }
    }
    
    console.log(`Loaded ${visited.size} already processed URLs from database`);
  } catch (error) {
    console.error("Error loading existing URLs:", error);
  }
  
  console.log(`Starting crawler with concurrency of ${concurrency}`);
  
  // Process queue with parallelism
  while ((queue.length > 0 || inProgress.size > 0) && !crawlingStopped) {
    // Log crawler status periodically
    if (queue.length > 0 || inProgress.size > 0) {
      console.log(`Crawler status: ${inProgress.size} in progress, ${queue.length} queued, ${visited.size} visited`);
    }
    
    // Fill the processing queue up to concurrency limit
    while (inProgress.size < concurrency && queue.length > 0 && !crawlingStopped) {
      const url = queue.shift()!;
      
      // Skip if already visited or in progress - check both local and global state
      if (visited.has(url) || inProgress.has(url) || globalVisitedUrls.has(url)) {
        console.log(`Skipping already visited/in-progress URL: ${url}`);
        continue;
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
              if (visited.has(link) || globalVisitedUrls.has(link)) {
                console.log(`Skipping already known URL: ${link}`);
                continue;
              }
              
              // Check if URL exists in database before adding
              try {
                const urlObj = await getURLByUrl(config.sessionId, link);
                
                // If URL exists and is already processed, skip it
                if (urlObj && (urlObj.status === 'crawled' || urlObj.status === 'error' || urlObj.status === 'processed')) {
                  console.log(`Skipping already processed URL from DB: ${link}`);
                  visited.add(link);
                  globalVisitedUrls.add(link);
                  continue;
                }
              } catch (err) {
                console.error(`Error checking URL status in DB: ${link}`, err);
              }
              
              // Add to queue since it's not processed yet
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