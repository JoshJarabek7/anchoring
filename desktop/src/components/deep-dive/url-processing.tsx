import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassContainer } from "@/components/ui/glass-container";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTechnologyStore } from "@/stores/technology-store";
import { DocumentationUrl, useUrlStore } from "@/stores/url-store";
import { CrawlEvent } from "@/types/events";
import { Channel } from "@tauri-apps/api/core";
import { ExternalLink, Loader2, Play, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Pagination } from "@/components/ui/pagination";
import { invoke } from "@tauri-apps/api/core";

// URL status filter options
type StatusFilter =
  | "all"
  | "pending"
  | "crawled"
  | "error"
  | "processing"
  | "completed";

export function UrlProcessing() {
  const { selectedTechnology, selectedVersion } = useTechnologyStore();
  const {
    urls,
    selectedUrls,
    fetchUrls,
    toggleUrlSelection,
    clearUrlSelection,
    fetchUrl,
    startCrawling,
    fetchCrawlingSettings,
    currentCrawlingSettings,
  } = useUrlStore();

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUrlDetails, setSelectedUrlDetails] =
    useState<DocumentationUrl | null>(null);
  const [isUrlDetailsOpen, setIsUrlDetailsOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Add pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load URLs when the version changes
  useEffect(() => {
    if (selectedVersion) {
      // Explicitly set includeContent to false for better performance
      fetchUrls(selectedVersion.id, false);
      fetchCrawlingSettings(selectedVersion.id);
    }
  }, [selectedVersion, fetchUrls, fetchCrawlingSettings]);

  // Memoize the filtered URLs to avoid recalculating on every render
  const filteredUrls = useMemo(() => {
    // First apply search filter
    let filtered = searchTerm
      ? urls.filter((url) =>
          url.url.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : urls;

    // Then apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((url) => {
        switch (statusFilter) {
          case "pending":
            return (
              url.status === "pending_crawl" ||
              url.status === "pending_markdown" ||
              url.status === "pending_processing"
            );
          case "crawled":
            return url.status === "crawled" || url.status === "markdown_ready";
          case "error":
            return (
              url.status === "crawl_error" ||
              url.status === "markdown_error" ||
              url.status === "processing_error"
            );
          case "processing":
            return (
              url.status === "crawling" ||
              url.status === "converting_markdown" ||
              url.status === "processing"
            );
          case "completed":
            return url.status === "processed";
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [urls, searchTerm, statusFilter]);

  // Paginate the filtered URLs
  const paginatedUrls = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredUrls.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredUrls, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = Math.ceil(filteredUrls.length / itemsPerPage);

  // Change page
  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

  // Adjust items per page
  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Handle URL selection change
  const handleUrlSelectionChange = (urlId: string) => {
    toggleUrlSelection(urlId);
  };

  // Handle select all for filtered URLs only
  const handleSelectAll = () => {
    const filteredUrlIds = filteredUrls.map((url) => url.id);
    const allFilteredSelected = filteredUrlIds.every((id) =>
      selectedUrls.includes(id)
    );

    if (allFilteredSelected) {
      // If all filtered URLs are selected, deselect only those in the current filter
      const newSelection = selectedUrls.filter(
        (id) => !filteredUrlIds.includes(id)
      );
      clearUrlSelection();

      // Re-add the ones we want to keep
      if (newSelection.length > 0) {
        newSelection.forEach((id) => toggleUrlSelection(id));
      }
    } else {
      // Select all filtered URLs while keeping existing selections
      filteredUrlIds.forEach((id) => {
        if (!selectedUrls.includes(id)) {
          toggleUrlSelection(id);
        }
      });
    }
  };

  // Open URL details
  const handleOpenUrlDetails = async (urlId: string) => {
    setIsLoadingDetails(true);
    try {
      // Only fetch the full URL details with content when opening details
      const urlDetails = await fetchUrl(urlId);
      if (urlDetails) {
        setSelectedUrlDetails(urlDetails);
        setIsUrlDetailsOpen(true);
      }
    } catch (error) {
      console.error("Error fetching URL details:", error);
      toast.error("Failed to load URL details", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Handle crawling selected URLs
  const handleCrawlSelected = async () => {
    if (!selectedTechnology || !selectedVersion) {
      toast.error("Missing technology or version");
      return;
    }

    if (selectedUrls.length === 0) {
      toast.error("No URLs selected for crawling");
      return;
    }

    // Get crawling settings
    let settings: CrawlingSettings;
    try {
      settings = await invoke<CrawlingSettings>(
        "get_version_crawling_settings",
        {
          versionId: selectedVersion.id,
        }
      );
    } catch (error) {
      toast.error("Failed to load crawling settings", {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Parse anti-paths and anti-keywords from settings
    const antiPaths = settings.antiPaths
      ? settings.antiPaths.split("\n").filter(Boolean)
      : [];
    const antiKeywords = settings.antiKeywords
      ? settings.antiKeywords.split("\n").filter(Boolean)
      : [];

    // Start crawling each selected URL
    setIsCrawling(true);

    try {
      // Only show a single toast at the start instead of one per URL
      toast.info(`Crawling ${selectedUrls.length} URLs`, {
        description: "This process will run in the background",
      });

      const processedUrls = [];

      for (const urlId of selectedUrls) {
        const url = urls.find((u) => u.id === urlId);
        if (!url) continue;

        try {
          // Create a channel for crawl events
          const channel = new Channel<CrawlEvent>("crawl-events");

          // Start crawling
          const taskId = await invoke<string>("start_crawling", {
            technologyId: selectedTechnology.id,
            versionId: selectedVersion.id,
            startUrl: url.url,
            prefixPath: settings.prefixPath || "",
            antiPaths,
            antiKeywords,
            skipProcessedUrls: true,
            onEvent: channel,
          });

          processedUrls.push(url.url);

          // No need for toast per URL
          console.log(`Started crawling URL: ${url.url} (Task ID: ${taskId})`);
        } catch (error) {
          console.error(`Error crawling URL ${url.url}:`, error);
          // Keep error toasts to show issues
          toast.error(`Failed to crawl URL: ${url.url}`, {
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // If any URLs were processed successfully, show a success toast
      if (processedUrls.length > 0) {
        toast.success(`Started crawling ${processedUrls.length} URLs`, {
          description: "You can view progress in the task queue",
        });
      }

      // Clear selection after processing
      clearUrlSelection();
    } catch (error) {
      toast.error("Failed to start crawling", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCrawling(false);
    }
  };

  // Handle manually refreshing the URLs list
  const handleRefreshUrls = async () => {
    if (!selectedVersion) return;

    setIsRefreshing(true);
    try {
      await fetchUrls(selectedVersion.id, false);
      toast.success("URLs refreshed successfully");
    } catch (error) {
      console.error("Error refreshing URLs:", error);
      toast.error("Failed to refresh URLs", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get URL status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_crawl":
        return <Badge variant="outline">Pending</Badge>;
      case "crawling":
        return <Badge className="bg-blue-500/80 animate-pulse">Crawling</Badge>;
      case "crawled":
        return <Badge className="bg-green-500/80">Crawled</Badge>;
      case "crawl_error":
        return <Badge variant="destructive">Error</Badge>;
      case "pending_markdown":
        return <Badge variant="outline">Pending</Badge>;
      case "converting_markdown":
        return (
          <Badge className="bg-blue-500/80 animate-pulse">Converting</Badge>
        );
      case "markdown_ready":
        return <Badge className="bg-green-500/80">Ready</Badge>;
      case "markdown_error":
        return <Badge variant="destructive">Error</Badge>;
      case "pending_processing":
        return <Badge variant="outline">Pending</Badge>;
      case "processing":
        return (
          <Badge className="bg-blue-500/80 animate-pulse">Processing</Badge>
        );
      case "processed":
        return <Badge className="bg-green-500/80">Processed</Badge>;
      case "processing_error":
        return <Badge variant="destructive">Error</Badge>;
      case "skipped":
        return <Badge variant="secondary">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Clear selected URL details when closing dialog to free up memory
  const handleCloseDetails = () => {
    setIsUrlDetailsOpen(false);
    // After a short delay to allow for animations, clear the details from memory
    setTimeout(() => {
      setSelectedUrlDetails(null);
    }, 300);
  };

  // Use URLs list optimized for rendering (no animations for 1000+ items)
  const UrlListItem = useMemo(() => {
    return ({ url }: { url: DocumentationUrl; index: number }) => (
      <div
        key={url.id}
        className={`flex flex-wrap items-start gap-3 p-2 rounded-md transition-colors ${
          selectedUrls.includes(url.id) ? "bg-primary/10" : ""
        } hover:bg-muted/30 cursor-pointer mb-1`}
      >
        <Checkbox
          checked={selectedUrls.includes(url.id)}
          onCheckedChange={() => handleUrlSelectionChange(url.id)}
          className="glass-surface flex-shrink-0 mt-1"
        />

        <div className="flex-1 min-w-0 max-w-[50%]">
          <div className="text-sm break-all">{url.url}</div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 ml-auto">
          {getStatusBadge(url.status)}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => handleOpenUrlDetails(url.id)}
            disabled={isLoadingDetails}
          >
            {isLoadingDetails ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }, [
    selectedUrls,
    handleUrlSelectionChange,
    isLoadingDetails,
    getStatusBadge,
    handleOpenUrlDetails,
  ]);

  // Don't render if no version is selected
  if (!selectedVersion) return null;

  return (
    <>
      <GlassContainer
        depth="deep"
        className="p-6"
        withNoise
        depthLevel={2}
        animate
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">URL Processing</h2>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshUrls}
              disabled={isRefreshing}
              className="flex items-center gap-1.5"
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <div className="text-sm text-muted-foreground">
              {urls.length} URLs found • {selectedUrls.length} selected
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Search and bulk actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search URLs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 glass-input"
              />
            </div>

            <div className="flex gap-2 ">
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem className="text-blue-50" value="all">
                    All Statuses
                  </SelectItem>
                  <SelectItem className="text-blue-50" value="pending">
                    Pending
                  </SelectItem>
                  <SelectItem className="text-blue-50" value="processing">
                    Processing
                  </SelectItem>
                  <SelectItem className="text-blue-50" value="crawled">
                    Crawled/Ready
                  </SelectItem>
                  <SelectItem className="text-blue-50" value="completed">
                    Completed
                  </SelectItem>
                  <SelectItem className="text-blue-50" value="error">
                    Error
                  </SelectItem>
                </SelectContent>
              </Select>

              {filteredUrls.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="shrink-0"
                >
                  {selectedUrls.length === filteredUrls.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end">
            {selectedUrls.length > 0 && (
              <Button
                onClick={handleCrawlSelected}
                disabled={isCrawling || selectedUrls.length === 0}
                className="glass-button glass-current"
              >
                {isCrawling ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Crawl Selected ({selectedUrls.length})
              </Button>
            )}
          </div>

          {/* URL List */}
          <GlassContainer
            depth="surface"
            className="rounded-md overflow-hidden p-0"
            withDepthStriations
          >
            <ScrollArea className="h-[400px] pr-4">
              {filteredUrls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">No URLs found</p>
                </div>
              ) : (
                <div className="py-1">
                  {paginatedUrls.map((url, index) => (
                    <UrlListItem key={url.id} url={url} index={index} />
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Pagination section at the bottom of the component */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredUrls.length / itemsPerPage)}
                totalItems={filteredUrls.length}
                pageSize={itemsPerPage}
                onPageChange={handlePageChange}
                onPageSizeChange={handleItemsPerPageChange}
                pageSizeOptions={[10, 25, 50, 100]}
                className="w-full"
              />
            </div>
          </GlassContainer>
        </div>
      </GlassContainer>

      {/* URL Details Dialog */}
      <Dialog open={isUrlDetailsOpen} onOpenChange={handleCloseDetails}>
        <DialogContent className="glass-abyss sm:max-w-[600px] md:max-w-[800px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>URL Details</DialogTitle>
          </DialogHeader>

          <DialogDescription className="sr-only">
            View detailed information about the selected URL
          </DialogDescription>

          <ScrollArea className="flex-1">
            {selectedUrlDetails && (
              <div className="space-y-4">
                <div className="p-2 bg-muted/30 rounded-md">
                  <div className="flex flex-wrap items-start gap-2">
                    <a
                      href={selectedUrlDetails.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-start gap-1 break-all mr-2 flex-1"
                    >
                      {selectedUrlDetails.url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1" />
                    </a>
                    <div className="flex-shrink-0">
                      {getStatusBadge(selectedUrlDetails.status)}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedUrlDetails.html && (
                    <div>
                      <h3 className="text-md font-medium mb-1">HTML Content</h3>
                      <div className="bg-muted/30 p-3 rounded-md h-[200px] overflow-y-auto">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {selectedUrlDetails.html.substring(0, 2000)}
                          {selectedUrlDetails.html.length > 2000 && "..."}
                        </pre>
                      </div>
                    </div>
                  )}

                  {selectedUrlDetails.markdown && (
                    <div>
                      <h3 className="text-md font-medium mb-1">
                        Markdown Content
                      </h3>
                      <div className="bg-muted/30 p-3 rounded-md h-[200px] overflow-y-auto">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {selectedUrlDetails.markdown.substring(0, 2000)}
                          {selectedUrlDetails.markdown.length > 2000 && "..."}
                        </pre>
                      </div>
                    </div>
                  )}

                  {selectedUrlDetails.cleanedMarkdown && (
                    <div>
                      <h3 className="text-md font-medium mb-1">
                        Cleaned Markdown
                      </h3>
                      <div className="bg-muted/30 p-3 rounded-md h-[200px] overflow-y-auto">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {selectedUrlDetails.cleanedMarkdown.substring(
                            0,
                            2000
                          )}
                          {selectedUrlDetails.cleanedMarkdown.length > 2000 &&
                            "..."}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
