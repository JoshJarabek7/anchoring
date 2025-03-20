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
import { DocumentationUrl, UrlStatus, useUrlStore } from "@/stores/url-store";
import { CrawlEvent } from "@/types/events";
import { Channel } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { ExternalLink, Filter, Loader2, Play, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
    selectAllUrls,
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

  // Load URLs when the version changes
  useEffect(() => {
    if (selectedVersion) {
      fetchUrls(selectedVersion.id);
      fetchCrawlingSettings(selectedVersion.id);
    }
  }, [selectedVersion, fetchUrls, fetchCrawlingSettings]);

  // Apply filters to URLs
  const getFilteredUrls = () => {
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
  };

  const filteredUrls = getFilteredUrls();

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
      const urlDetails = await fetchUrl(urlId);
      if (urlDetails) {
        setSelectedUrlDetails(urlDetails);
        setIsUrlDetailsOpen(true);
      }
    } catch (error) {
      console.error("Error fetching URL details:", error);
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

    try {
      setIsCrawling(true);

      // Ensure we have the latest crawl settings
      await fetchCrawlingSettings(selectedVersion.id);

      const prefixPath = currentCrawlingSettings?.prefixPath || "";
      const antiPathsString = currentCrawlingSettings?.antiPaths || "";
      const antiKeywordsString = currentCrawlingSettings?.antiKeywords || "";

      // Parse anti-paths and anti-keywords
      const antiPaths = antiPathsString
        .split(",")
        .map((p: string) => p.trim())
        .filter((p: string) => p);
      const antiKeywords = antiKeywordsString
        .split(",")
        .map((k: string) => k.trim())
        .filter((k: string) => k);

      console.log("Crawling selected URLs:", selectedUrls.length);
      console.log("Settings:", {
        prefixPath,
        antiPaths,
        antiKeywords,
      });

      // Get selected URL objects
      const selectedUrlObjects = urls.filter((url) =>
        selectedUrls.includes(url.id)
      );
      console.log("Selected URL objects:", selectedUrlObjects.length);

      // Start crawling each URL individually with robust error handling
      let successCount = 0;
      const taskIds = [];
      const totalUrls = selectedUrlObjects.length;
      const errorUrls = [];

      console.log(
        `Starting crawl for ${totalUrls} URLs. This will create ${totalUrls} individual crawl tasks.`
      );

      // Use a for loop with proper error isolation
      for (let i = 0; i < selectedUrlObjects.length; i++) {
        const url = selectedUrlObjects[i];
        const urlIndex = i + 1;

        console.log(
          `[${urlIndex}/${totalUrls}] Starting crawl for URL: ${url.url}`
        );

        try {
          // Create a new channel for each URL
          const onEvent = new Channel<CrawlEvent>();

          // Create an error timeout in case the event never returns
          const timeoutPromise = new Promise<null>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(`Timeout waiting for crawler response for ${url.url}`)
              );
            }, 15000); // 15 second timeout
          });

          // Set up URL parameters
          const urlPrefix = prefixPath || new URL(url.url).origin;

          console.log(
            `[${urlIndex}/${totalUrls}] Creating crawl task with params:`,
            {
              url: url.url,
              prefixPath: urlPrefix,
              antiPaths,
              antiKeywords,
              skipProcessed: true,
            }
          );

          // Try to create the task with a timeout
          let taskId;
          try {
            // Use Promise.race to implement a timeout
            taskId = await Promise.race([
              startCrawling({
                technologyId: selectedTechnology.id,
                versionId: selectedVersion.id,
                startUrl: url.url,
                prefixPath: urlPrefix,
                antiPaths,
                antiKeywords,
                skipProcessedUrls: true,
                onEvent,
              }),
              timeoutPromise,
            ]);

            if (!taskId) {
              throw new Error("No task ID returned");
            }

            console.log(
              `[${urlIndex}/${totalUrls}] ✅ Task created for ${url.url} with ID: ${taskId}`
            );
            taskIds.push(taskId);
            successCount++;
          } catch (taskError) {
            console.error(
              `[${urlIndex}/${totalUrls}] ❌ Error creating task for ${url.url}:`,
              taskError
            );
            errorUrls.push(url.url);
            // Continue with the next URL despite error
          }

          // Always add a delay between task creations
          console.log(`[${urlIndex}/${totalUrls}] Waiting before next task...`);
          await new Promise((resolve) => setTimeout(resolve, 800));
          console.log(`[${urlIndex}/${totalUrls}] Ready for next task!`);
        } catch (error) {
          console.error(
            `[${urlIndex}/${totalUrls}] ❌ Error crawling URL: ${url.url}:`,
            error
          );
          errorUrls.push(url.url);
          // Continue with the next URL despite error
        }
      }

      // Report final results
      console.log(
        `✅ All crawl tasks attempted. Success: ${successCount}/${totalUrls}. Failed: ${errorUrls.length}.`
      );
      if (errorUrls.length > 0) {
        console.log(`Failed URLs:`, errorUrls);
      }

      if (successCount > 0) {
        toast.success(`Crawling initiated for ${successCount} URLs`, {
          description: "The URLs are being processed in the background",
        });

        // Clear the selection after crawling
        clearUrlSelection();

        // Refresh the URL list after a delay to see updates
        setTimeout(() => {
          if (selectedVersion) {
            fetchUrls(selectedVersion.id);
          }
        }, 2000);
      }
    } catch (error) {
      toast.error("Failed to start crawling", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsCrawling(false);
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
          <div className="text-sm text-muted-foreground">
            {urls.length} URLs found • {selectedUrls.length} selected
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
                  <SelectItem
                    className="text-blue-800 dark:text-blue-50"
                    value="all"
                  >
                    All Statuses
                  </SelectItem>
                  <SelectItem
                    className="text-blue-800 dark:text-blue-50"
                    value="pending"
                  >
                    Pending
                  </SelectItem>
                  <SelectItem
                    className="text-blue-800 dark:text-blue-50"
                    value="processing"
                  >
                    Processing
                  </SelectItem>
                  <SelectItem
                    className="text-blue-800 dark:text-blue-50"
                    value="crawled"
                  >
                    Crawled/Ready
                  </SelectItem>
                  <SelectItem
                    className="text-blue-800 dark:text-blue-50"
                    value="completed"
                  >
                    Completed
                  </SelectItem>
                  <SelectItem
                    className="text-blue-800 dark:text-blue-50"
                    value="error"
                  >
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
            <ScrollArea className="h-[60vh] max-h-[500px]">
              {filteredUrls.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-center">
                  <p className="text-muted-foreground">No URLs found</p>
                  <p className="text-sm text-muted-foreground/80 mt-1">
                    Start crawling to collect documentation URLs
                  </p>
                </div>
              ) : (
                <div className="py-1">
                  {filteredUrls.map((url, index) => (
                    <motion.div
                      key={url.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.2 }}
                      className={`
                        flex items-center px-4 py-2.5 gap-3 hover:bg-muted/40 transition-colors
                        ${
                          index !== filteredUrls.length - 1
                            ? "border-b border-border/30"
                            : ""
                        }
                      `}
                    >
                      <Checkbox
                        checked={selectedUrls.includes(url.id)}
                        onCheckedChange={() => handleUrlSelectionChange(url.id)}
                        className="glass-surface"
                      />

                      <div className="flex-1 overflow-hidden">
                        <div className="text-sm truncate">{url.url}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
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
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </GlassContainer>
        </div>
      </GlassContainer>

      {/* URL Details Dialog */}
      <Dialog open={isUrlDetailsOpen} onOpenChange={setIsUrlDetailsOpen}>
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
                  <div className="flex items-center gap-2">
                    <a
                      href={selectedUrlDetails.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {selectedUrlDetails.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {getStatusBadge(selectedUrlDetails.status)}
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
