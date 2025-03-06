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
import { getURLs, CrawlURL, cleanupDuplicateURLs, deleteAllURLs, getURLByUrl } from "../../lib/db";
import { RefreshCw, Trash2, AlertTriangle, Eye } from "lucide-react";
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

interface URLListProps {
  sessionId: number;
  onStartCrawling: (urls: string[]) => void;
  refreshTrigger?: number;
  isCrawling?: boolean;
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
      default:
        return 'secondary';
    }
  };
  
  const handleStartCrawling = () => {
    if (selectedUrls.length > 0) {
      onStartCrawling(selectedUrls);
    }
  };
  
  const handleCleanupDuplicates = async () => {
    if (!sessionId) return;
    
    try {
      setCleaningUp(true);
      const deletedCount = await cleanupDuplicateURLs(sessionId);
      
      if (deletedCount > 0) {
        toast.success(`Cleaned up ${deletedCount} duplicate URL${deletedCount !== 1 ? 's' : ''}`);
        // Refresh the URL list
        loadURLs();
      } else {
        toast.info("No duplicate URLs found");
      }
    } catch (error) {
      console.error("Error cleaning up duplicates:", error);
      toast.error("Failed to clean up duplicate URLs");
    } finally {
      setCleaningUp(false);
    }
  };
  
  const handleDeleteAllUrls = async () => {
    if (!sessionId) return;
    
    try {
      setDeleting(true);
      const deletedCount = await deleteAllURLs(sessionId);
      
      if (deletedCount > 0) {
        toast.success(`Deleted ${deletedCount} URL${deletedCount !== 1 ? 's' : ''}`);
        setSelectedUrls([]);
        // Refresh the URL list
        loadURLs();
      } else {
        toast.info("No URLs found to delete");
      }
    } catch (error) {
      console.error("Error deleting all URLs:", error);
      toast.error("Failed to delete URLs");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
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
  
  // Load URLs initially and when refreshTrigger changes
  useEffect(() => {
    // Check if refresh trigger is a full number (full refresh) or decimal (incremental refresh)
    const isFullRefresh = refreshTrigger === Math.floor(refreshTrigger);
    
    if (isFullRefresh || !initialLoadComplete) {
      // Do a full reload if it's a full refresh or initial load
      loadURLs();
    } else {
      // Just do an incremental refresh if it's a decimal trigger
      refreshUrlsIncremental();
    }
  }, [sessionId, refreshTrigger]);
  
  useEffect(() => {
    // Update selectAll state when selectedUrls or filteredUrls change
    setSelectAll(
      filteredUrls.length > 0 && 
      selectedUrls.length === filteredUrls.length
    );
  }, [selectedUrls, filteredUrls]);
  
  return (
    <>
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all URLs</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all URLs for this session. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDeleteAllUrls();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete All URLs"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    <URLDetailModal 
      url={selectedUrlDetail}
      open={detailModalOpen}
      onOpenChange={setDetailModalOpen}
    />
    
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Filter URLs..."
              value={filter}
              onChange={handleFilterChange}
              className="flex-1"
            />
            <div className="flex items-center mr-2">
              <Switch
                id="auto-refresh"
                checked={autoRefreshEnabled}
                onCheckedChange={setAutoRefreshEnabled}
                className="mr-2"
              />
              <Label htmlFor="auto-refresh" className="text-xs">Auto-refresh</Label>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => loadURLs(true)} 
              title="Refresh URLs"
              className="mr-1"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {Object.keys(duplicateUrlMap).length > 0 && (
              <Button
                variant="outline"
                onClick={handleCleanupDuplicates}
                disabled={cleaningUp}
                title="Remove duplicate URLs"
                className="mr-1"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {cleaningUp ? "Cleaning..." : "Clean Duplicates"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={urls.length === 0 || deleting}
              className="bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive mr-1"
              title="Delete all URLs"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Delete All
            </Button>
            <Button 
              onClick={handleStartCrawling}
              disabled={selectedUrls.length === 0}
            >
              Start Crawling ({selectedUrls.length})
            </Button>
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
            <div ref={urlListContainerRef}>
              <ScrollArea className="h-[400px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUrls.map((url) => (
                      <TableRow key={url.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUrls.includes(url.url)}
                            onCheckedChange={(checked) => 
                              handleSelectURL(url.url, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[400px] flex items-center">
                          {url.url}
                          {duplicateUrlMap[url.url] && duplicateUrlMap[url.url] > 1 && (
                            <Badge variant="outline" className="ml-2" title={`This URL appears ${duplicateUrlMap[url.url]} times`}>
                              {duplicateUrlMap[url.url]}
                            </Badge>
                          )}
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
            </div>
          )}
          
          <div className="text-sm text-gray-500">
            {filteredUrls.length} URLs {urls.length !== filteredUrls.length && `(filtered from ${urls.length})`}
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}