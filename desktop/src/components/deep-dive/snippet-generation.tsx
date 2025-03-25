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
import { useTechnologyStore } from "@/stores/technology-store";
import { DocumentationUrl, useUrlStore } from "@/stores/url-store";
import { SnippetEvent } from "@/types/events";
import { Channel } from "@tauri-apps/api/core";
import { ExternalLink, Info, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Pagination } from "@/components/ui/pagination";
import { invoke } from "@tauri-apps/api/core";

export function SnippetGeneration() {
  const { selectedVersion } = useTechnologyStore();
  const {
    urls,
    selectedUrls,
    fetchUrls,
    toggleUrlSelection,
    clearUrlSelection,
    fetchUrl,
    generateSnippets,
    isLoading,
  } = useUrlStore();

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUrlDetails, setSelectedUrlDetails] =
    useState<DocumentationUrl | null>(null);
  const [isUrlDetailsOpen, setIsUrlDetailsOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Get markdown ready URLs that can be processed for snippets
  const eligibleUrls = useMemo(() => {
    return urls.filter(
      (url) =>
        url.status === "markdown_ready" || url.status === "processing_error"
    );
  }, [urls]);

  // Get selected URLs that are eligible for snippet generation
  const selectedEligibleUrls = eligibleUrls
    .filter((url) => selectedUrls.includes(url.id))
    .map((url) => url.id);

  // Refresh URLs when needed
  useEffect(() => {
    if (selectedVersion) {
      fetchUrls(selectedVersion.id, false);
    }
  }, [selectedVersion, fetchUrls]);

  // Memoize the filtered URLs to avoid recalculating on every render
  const filteredUrls = useMemo(() => {
    // Filter to only show eligible URLs
    let filtered = eligibleUrls;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((url) =>
        url.url.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [eligibleUrls, searchTerm]);

  // Paginate the filtered URLs
  const paginatedUrls = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredUrls.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredUrls, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = Math.ceil(filteredUrls.length / itemsPerPage);

  // Change page
  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages || 1));
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

  // Handle generating snippets for selected URLs
  const handleGenerateSnippets = async () => {
    // Filter URLs that have cleaned markdown content
    const eligibleUrls = selectedUrls.filter((urlId) => {
      const url = urls.find((u) => u.id === urlId);
      return url && url.status === "markdown_ready";
    });

    if (eligibleUrls.length === 0) {
      toast.error("No eligible URLs selected", {
        description: "Please select URLs with status 'Markdown Ready'",
      });
      return;
    }

    try {
      setIsGenerating(true);

      // Single toast at the start
      toast.info("Snippet generation started", {
        description: `Processing ${eligibleUrls.length} URLs in the background.`,
      });

      // Create a channel for events
      const channel = new Channel<SnippetEvent>();

      // Start the snippet generation process
      await invoke<string[]>("generate_snippets", {
        urlIds: eligibleUrls,
        onEvent: channel,
      });

      // Success toast at completion - this will be triggered by the event handler
      // We don't need additional toasts here

      // Clear selection after processing
      clearUrlSelection();
    } catch (error) {
      toast.error("Failed to generate snippets", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsGenerating(false);
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
      case "markdown_ready":
        return <Badge className="bg-green-500/80">Ready</Badge>;
      case "processing_error":
        return <Badge variant="destructive">Error</Badge>;
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
          <h2 className="text-xl font-semibold">Snippet Generation</h2>
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
              {eligibleUrls.length} eligible URLs •{" "}
              {selectedEligibleUrls.length} selected
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Description */}
          <div className="bg-muted/30 p-4 rounded-lg flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm">
                Snippet generation uses AI to break down documentation into
                self-contained, reusable knowledge snippets. This makes the
                information more searchable and contextual.
              </p>
            </div>
          </div>

          {/* Search and bulk actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                placeholder="Search URLs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="glass-input"
              />
            </div>

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

          {/* Action buttons */}
          <div className="flex justify-end">
            {selectedEligibleUrls.length > 0 && (
              <Button
                onClick={handleGenerateSnippets}
                disabled={
                  isGenerating || selectedEligibleUrls.length === 0 || isLoading
                }
                className="glass-button glass-current"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Snippets ({selectedEligibleUrls.length})
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
                  <p className="text-sm text-muted-foreground">
                    No eligible URLs found
                  </p>
                </div>
              ) : (
                <div className="py-1">
                  {paginatedUrls.map((url) => (
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
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Pagination section */}
            {filteredUrls.length > 0 && (
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
            )}
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
