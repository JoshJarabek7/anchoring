import { useState, useEffect, useRef } from "react";
import { 
  Card, 
  CardContent
} from "../ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { 
  getURLs, 
  CrawlURL, 
  cleanupDuplicateURLs, 
  deleteAllURLs, 
  getURLByUrl,
  getURLsMatchingAntiPatterns,
  deleteURLsMatchingAntiPatterns
} from "../../lib/db";
import { 
  RefreshCw, 
  Trash2, 
  AlertTriangle, 
  Eye,
  FilterX,
  Settings
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import URLDetailModal from "./URLDetailModal";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { getCrawlSettings } from "../../lib/db";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";

interface URLListProps {
  sessionId: number;
  onStartCrawling: (urls: string[]) => void;
  refreshTrigger?: number;
  isCrawling?: boolean;
}

// Status types for URL filtering
type StatusFilter = 'all' | 'pending' | 'crawled' | 'processed' | 'error' | 'skipped';

// Crawling behavior options
interface CrawlOptions {
  skipProcessed: boolean;
  crawlPendingOnly: boolean;
  statusFilter: StatusFilter;
}

export default function URLList({ sessionId, onStartCrawling, refreshTrigger = 0, isCrawling = false }: URLListProps) {
  const [urls, setUrls] = useState<CrawlURL[]>([]);
  const [filteredUrls, setFilteredUrls] = useState<CrawlURL[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [duplicateUrlMap, setDuplicateUrlMap] = useState<Record<string, number>>({});
  const [cleaningUp, setCleaningUp] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedUrlDetail, setSelectedUrlDetail] = useState<CrawlURL | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const urlListContainerRef = useRef<HTMLDivElement>(null);
  
  // Crawl options state
  const [crawlOptions, setCrawlOptions] = useState<CrawlOptions>({
    skipProcessed: true,
    crawlPendingOnly: false,
    statusFilter: 'all'
  });
  
  // Anti-pattern filtering state
  const [antiPatternDialogOpen, setAntiPatternDialogOpen] = useState(false);
  const [antiPatternFiltering, setAntiPatternFiltering] = useState(false);
  const [urlsMatchingAntiPatterns, setUrlsMatchingAntiPatterns] = useState<CrawlURL[]>([]);
  const [antiPatternLoading, setAntiPatternLoading] = useState(false);
  
  // Initial load of URLs
  const loadURLs = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const data = await getURLs(sessionId);
      setUrls(data);
      
      // Apply current filter
      if (filter) {
        const filtered = data.filter(url => 
          url.url.toLowerCase().includes(filter.toLowerCase())
        );
        setFilteredUrls(filtered);
      } else {
        setFilteredUrls(data);
      }
      
      // Find duplicate URLs
      const urlCounts: Record<string, number> = {};
      data.forEach(item => {
        urlCounts[item.url] = (urlCounts[item.url] || 0) + 1;
      });
      
      // Filter to only URLs that appear more than once
      const duplicates: Record<string, number> = {};
      Object.entries(urlCounts).forEach(([url, count]) => {
        if (count > 1) {
          duplicates[url] = count;
        }
      });
      
      setDuplicateUrlMap(duplicates);
      setInitialLoadComplete(true);
    } catch (error) {
      console.error("Failed to load URLs:", error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };
  
  // Check for new URLs without full reload
  const refreshUrlsIncremental = async () => {
    if (!sessionId || !initialLoadComplete) return;
    
    try {
      const data = await getURLs(sessionId);
      
      // Only update if we have new URLs or changes
      if (data.length !== urls.length) {
        // Get the new URLs
        const existingUrlSet = new Set(urls.map(u => u.url));
        const newUrls = data.filter(url => !existingUrlSet.has(url.url));
        
        if (newUrls.length > 0) {
          console.log(`Found ${newUrls.length} new URLs`);
          
          // Update the URLs array without resetting scroll or showing loading
          setUrls(data);
          
          // Apply current filter to the new list
          if (filter) {
            const filtered = data.filter(url => 
              url.url.toLowerCase().includes(filter.toLowerCase())
            );
            setFilteredUrls(filtered);
          } else {
            setFilteredUrls(data);
          }
          
          // Update duplicate map
          const urlCounts: Record<string, number> = {};
          data.forEach(item => {
            urlCounts[item.url] = (urlCounts[item.url] || 0) + 1;
          });
          
          const duplicates: Record<string, number> = {};
          Object.entries(urlCounts).forEach(([url, count]) => {
            if (count > 1) {
              duplicates[url] = count;
            }
          });
          
          setDuplicateUrlMap(duplicates);
        } else {
          // Check for URL status changes
          const hasStatusChanges = data.some((newUrl, index) => {
            const oldUrl = urls[index];
            return oldUrl && oldUrl.url === newUrl.url && oldUrl.status !== newUrl.status;
          });
          
          if (hasStatusChanges) {
            console.log("URL statuses have changed, updating");
            setUrls(data);
            
            // Apply current filter to the new list
            if (filter) {
              const filtered = data.filter(url => 
                url.url.toLowerCase().includes(filter.toLowerCase())
              );
              setFilteredUrls(filtered);
            } else {
              setFilteredUrls(data);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to refresh URLs incrementally:", error);
    }
  };
  
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setFilter(value);
    
    if (!value) {
      setFilteredUrls(urls);
    } else {
      const filtered = urls.filter(url => 
        url.url.toLowerCase().includes(value)
      );
      setFilteredUrls(filtered);
    }
  };
  
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUrls([]);
    } else {
      setSelectedUrls(filteredUrls.map(url => url.url));
    }
    setSelectAll(!selectAll);
  };
  
  const handleSelectURL = (url: string, checked: boolean) => {
    if (checked) {
      setSelectedUrls(prev => [...prev, url]);
    } else {
      setSelectedUrls(prev => prev.filter(u => u !== url));
    }
  };

  // Apply status filtering based on crawl options
  const applyStatusFilter = (urlsToFilter: CrawlURL[]) => {
    if (crawlOptions.statusFilter === 'all') {
      return urlsToFilter;
    }
    
    return urlsToFilter.filter(url => url.status === crawlOptions.statusFilter);
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'crawled':
        return 'default';
      case 'error':
        return 'destructive';
      case 'skipped':
        return 'outline';
      case 'processed':
        return 'success';
      default:
        return 'secondary';
    }
  };
  
  const handleStartCrawling = () => {
    if (selectedUrls.length === 0) {
      toast.error("No URLs selected for crawling");
      return;
    }
    
    // Apply crawl options to filter the selected URLs
    let urlsToCrawl = [...selectedUrls];
    
    if (crawlOptions.skipProcessed || crawlOptions.crawlPendingOnly) {
      // Get the actual URL objects for the selected URLs
      const selectedUrlObjects = urls.filter(url => selectedUrls.includes(url.url));
      
      // Apply filters based on options
      const filteredUrlObjects = selectedUrlObjects.filter(url => {
        if (crawlOptions.skipProcessed && url.status === 'processed') {
          return false;
        }
        if (crawlOptions.crawlPendingOnly && url.status !== 'pending') {
          return false;
        }
        return true;
      });
      
      // Convert back to URL strings
      urlsToCrawl = filteredUrlObjects.map(url => url.url);
      
      if (urlsToCrawl.length === 0) {
        toast.error("No URLs match your crawl options. Adjust your options or selection.");
        return;
      }
      
      if (urlsToCrawl.length !== selectedUrls.length) {
        toast.info(`Crawling ${urlsToCrawl.length} of ${selectedUrls.length} selected URLs based on your options.`);
      }
    }
    
    onStartCrawling(urlsToCrawl);
  };
  
  const handleCleanupDuplicates = async () => {
    if (Object.keys(duplicateUrlMap).length === 0) return;
    
    try {
      setCleaningUp(true);
      const removedCount = await cleanupDuplicateURLs(sessionId);
      toast.success(`Removed ${removedCount} duplicate URLs`);
      loadURLs(true);
    } catch (error) {
      console.error("Error cleaning up duplicates:", error);
      toast.error("Failed to clean up duplicates");
    } finally {
      setCleaningUp(false);
    }
  };
  
  const handleDeleteAllUrls = async () => {
    try {
      setDeleting(true);
      const deletedCount = await deleteAllURLs(sessionId);
      setDeleteDialogOpen(false);
      toast.success(`Deleted ${deletedCount} URLs`);
      loadURLs(true);
    } catch (error) {
      console.error("Error deleting all URLs:", error);
      toast.error("Failed to delete all URLs");
    } finally {
      setDeleting(false);
    }
  };
  
  const handleViewDetails = async (url: CrawlURL) => {
    try {
      // If we have the full URL data (html, markdown, etc.), use it directly
      if (url.html || url.markdown || url.cleaned_markdown) {
        setSelectedUrlDetail(url);
      } else {
        // Otherwise, fetch the full URL data
        const fullUrl = await getURLByUrl(sessionId, url.url);
        if (fullUrl) {
          setSelectedUrlDetail(fullUrl);
        } else {
          setSelectedUrlDetail(url);
        }
      }
      setDetailModalOpen(true);
    } catch (error) {
      console.error("Error fetching URL details:", error);
      toast.error("Failed to load URL details");
    }
  };
  
  useEffect(() => {
    loadURLs();
  }, [sessionId]);
  
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadURLs();
    }
  }, [refreshTrigger]);
  
  // Create a derived state of the filtered URLs to display URL counts by status
  const getUrlCountsByStatus = () => {
    const counts = {
      all: urls.length,
      pending: 0,
      crawled: 0,
      error: 0,
      skipped: 0,
      processed: 0
    };
    
    urls.forEach(url => {
      counts[url.status as keyof typeof counts] += 1;
    });
    
    return counts;
  };
  
  const urlCountsByStatus = getUrlCountsByStatus();
  
  // Handle status filter change
  const handleStatusFilterChange = (value: string) => {
    setCrawlOptions(prev => ({
      ...prev,
      statusFilter: value as StatusFilter
    }));
    
    // Apply the new filter
    if (value === 'all') {
      if (filter) {
        const filtered = urls.filter(url => 
          url.url.toLowerCase().includes(filter.toLowerCase())
        );
        setFilteredUrls(filtered);
      } else {
        setFilteredUrls(urls);
      }
    } else {
      const statusFiltered = urls.filter(url => url.status === value);
      
      if (filter) {
        const filtered = statusFiltered.filter(url => 
          url.url.toLowerCase().includes(filter.toLowerCase())
        );
        setFilteredUrls(filtered);
      } else {
        setFilteredUrls(statusFiltered);
      }
    }
    
    // Clear selections when filter changes
    setSelectedUrls([]);
    setSelectAll(false);
  };
  
  // Handle crawl option changes
  const handleCrawlOptionChange = (option: keyof CrawlOptions, value: boolean) => {
    setCrawlOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };
  
  // Delete URLs matching anti-patterns
  const handleDeleteAntiPatternUrls = async () => {
    try {
      setAntiPatternFiltering(true);
      
      // Get crawler settings
      const settings = await getCrawlSettings(sessionId);
      if (!settings) {
        toast.error("Failed to load crawler settings");
        return;
      }
      
      // Parse anti-patterns
      const antiPaths = (settings.anti_paths || "")
        .split(",")
        .filter(Boolean)
        .map(path => path.trim());
      
      const antiKeywords = (settings.anti_keywords || "")
        .split(",")
        .filter(Boolean)
        .map(keyword => keyword.trim());
      
      // Delete matching URLs
      const deletedCount = await deleteURLsMatchingAntiPatterns(
        sessionId, 
        antiPaths, 
        antiKeywords
      );
      
      // Close dialog and refresh
      setAntiPatternDialogOpen(false);
      loadURLs(true);
      
      // Show success message
      toast.success(`Removed ${deletedCount} URLs matching anti-patterns`);
    } catch (error) {
      console.error("Error deleting URLs matching anti-patterns:", error);
      toast.error("Failed to delete URLs matching anti-patterns");
    } finally {
      setAntiPatternFiltering(false);
    }
  };
  
  // Set up interval for automatic refresh if enabled
  useEffect(() => {
    if (!autoRefreshEnabled || !initialLoadComplete) return;
    
    const intervalId = setInterval(() => {
      if (isCrawling) {
        refreshUrlsIncremental();
      }
    }, 3000); // Refresh every 3 seconds
    
    return () => clearInterval(intervalId);
  }, [autoRefreshEnabled, isCrawling, sessionId, initialLoadComplete, urls, filter]);
  
  // Load the list of URLs matching anti-patterns
  const loadAntiPatternUrls = async () => {
    try {
      setAntiPatternLoading(true);
      
      // Get crawler settings
      const settings = await getCrawlSettings(sessionId);
      if (!settings) {
        toast.error("Failed to load crawler settings");
        return;
      }
      
      // Parse anti-patterns
      const antiPaths = (settings.anti_paths || "")
        .split(",")
        .filter(Boolean)
        .map(path => path.trim());
      
      const antiKeywords = (settings.anti_keywords || "")
        .split(",")
        .filter(Boolean)
        .map(keyword => keyword.trim());
      
      // Get matching URLs
      if (antiPaths.length === 0 && antiKeywords.length === 0) {
        toast.error("No anti-patterns defined in crawler settings");
        return;
      }
      
      const matchingUrls = await getURLsMatchingAntiPatterns(
        sessionId, 
        antiPaths, 
        antiKeywords
      );
      
      setUrlsMatchingAntiPatterns(matchingUrls);
      setAntiPatternDialogOpen(true);
    } catch (error) {
      console.error("Error loading URLs matching anti-patterns:", error);
      toast.error("Failed to load URLs matching anti-patterns");
    } finally {
      setAntiPatternLoading(false);
    }
  };

  return (
    <div ref={urlListContainerRef}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-[300px]">
          <Input
            placeholder="Filter URLs..."
            value={filter}
            onChange={handleFilterChange}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Label className="mr-2 text-sm" htmlFor="status-filter">Status:</Label>
            <Select 
              value={crawlOptions.statusFilter} 
              onValueChange={handleStatusFilterChange}
            >
              <SelectTrigger id="status-filter" className="w-[150px]">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({urlCountsByStatus.all})</SelectItem>
                <SelectItem value="pending">Pending ({urlCountsByStatus.pending})</SelectItem>
                <SelectItem value="crawled">Crawled ({urlCountsByStatus.crawled})</SelectItem>
                <SelectItem value="processed">Processed ({urlCountsByStatus.processed})</SelectItem>
                <SelectItem value="error">Error ({urlCountsByStatus.error})</SelectItem>
                <SelectItem value="skipped">Skipped ({urlCountsByStatus.skipped})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" title="Crawl Options">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Crawl Options</h4>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="skip-processed" 
                    checked={crawlOptions.skipProcessed}
                    onCheckedChange={(checked) => 
                      handleCrawlOptionChange('skipProcessed', checked === true)
                    }
                  />
                  <Label htmlFor="skip-processed">Skip already processed URLs</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="pending-only" 
                    checked={crawlOptions.crawlPendingOnly}
                    onCheckedChange={(checked) => 
                      handleCrawlOptionChange('crawlPendingOnly', checked === true)
                    }
                  />
                  <Label htmlFor="pending-only">Only crawl URLs with 'pending' status</Label>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <div className="flex items-center space-x-2">
            <Switch 
              id="auto-refresh" 
              checked={autoRefreshEnabled}
              onCheckedChange={setAutoRefreshEnabled}
            />
            <Label htmlFor="auto-refresh">Auto-refresh</Label>
          </div>
        </div>
      </div>
      
      <div className="bg-muted p-2 rounded-md mb-4 flex justify-between items-center">
        <div className="text-sm">
          <span>{filteredUrls.length} URLs</span>
          {selectedUrls.length > 0 && <span> ({selectedUrls.length} selected)</span>}
        </div>
        
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={filteredUrls.length === 0}
          >
            {selectAll ? "Deselect All" : "Select All"}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadURLs(true)}
            disabled={loading}
            title="Refresh URL list"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          {Object.keys(duplicateUrlMap).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanupDuplicates}
              disabled={cleaningUp}
              title={`${Object.keys(duplicateUrlMap).length} duplicate URLs found`}
              className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-800"
            >
              <div className="flex items-center">
                <Trash2 className="h-4 w-4 mr-1" />
                <span>Clean Up Duplicates</span>
              </div>
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={loadAntiPatternUrls}
            disabled={antiPatternLoading}
            title="Filter URLs matching anti-patterns"
            className="bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            <FilterX className="h-4 w-4 mr-1" />
            <span>Filter Anti-patterns</span>
          </Button>
            
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={urls.length === 0 || deleting}
            className="bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive"
            title="Delete all URLs"
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            <span>Delete All</span>
          </Button>
          
          <Button 
            size="sm"
            onClick={handleStartCrawling}
            disabled={selectedUrls.length === 0}
          >
            Start Crawling ({selectedUrls.length})
          </Button>
        </div>
      </div>
      
      {loading && !initialLoadComplete ? (
        <div className="text-center py-4">Loading URLs...</div>
      ) : filteredUrls.length === 0 ? (
        <div className="text-center py-4">
          {urls.length === 0 
            ? "No URLs discovered yet. Start by adding a URL to crawl." 
            : "No URLs match your filter."}
        </div>
      ) : (
        <ScrollArea className="h-[800px] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox 
                    checked={selectAll} 
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUrls.map(url => (
                <TableRow key={url.url}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedUrls.includes(url.url)} 
                      onCheckedChange={(checked) => handleSelectURL(url.url, checked === true)}
                      aria-label={`Select ${url.url}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-full overflow-x-auto no-scrollbar">
                      <span className="whitespace-nowrap">{url.url}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(url.status)}>
                      {url.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleViewDetails(url)}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
      
      {/* URL Detail Modal */}
      <URLDetailModal 
        url={selectedUrlDetail} 
        open={detailModalOpen} 
        onOpenChange={setDetailModalOpen} 
      />
      
      {/* Delete All Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all URLs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {urls.length} URLs in this session. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAllUrls}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Anti-pattern Filter Dialog */}
      <AlertDialog open={antiPatternDialogOpen} onOpenChange={setAntiPatternDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>URLs Matching Anti-Patterns</AlertDialogTitle>
            <AlertDialogDescription>
              {urlsMatchingAntiPatterns.length} URLs match your configured anti-patterns. 
              You can delete them to clean up your URL list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="max-h-[300px] overflow-y-auto border rounded-md p-2 my-2">
            {urlsMatchingAntiPatterns.length === 0 ? (
              <p className="text-center py-2">No matching URLs found</p>
            ) : (
              <ul className="space-y-1">
                {urlsMatchingAntiPatterns.map(url => (
                  <li key={url.url} className="truncate text-sm" title={url.url}>
                    {url.url}
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={antiPatternFiltering}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAntiPatternUrls}
              disabled={urlsMatchingAntiPatterns.length === 0 || antiPatternFiltering}
              className="bg-destructive hover:bg-destructive/90"
            >
              {antiPatternFiltering ? "Deleting..." : "Delete Matching URLs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}