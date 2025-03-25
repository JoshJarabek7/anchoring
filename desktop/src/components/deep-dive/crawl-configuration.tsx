import { Button } from "@/components/ui/button";
import { GlassContainer } from "@/components/ui/glass-container";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUrlStore } from "@/stores/url-store";
import { Filter, Loader2, Play, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Channel } from "@tauri-apps/api/core";
import { CrawlEvent } from "@/types/events";
import { motion } from "framer-motion";

export function CrawlConfiguration() {
  const { selectedTechnology, selectedVersion } = useTechnologyStore();
  const {
    fetchCrawlingSettings,
    currentCrawlingSettings,
    saveCrawlingSettings,
    applyUrlFilters,
    startCrawling,
    isLoading,
  } = useUrlStore();

  // Local form state
  const [startUrl, setStartUrl] = useState("");
  const [prefixPath, setPrefixPath] = useState("");
  const [antiPaths, setAntiPaths] = useState("");
  const [antiKeywords, setAntiKeywords] = useState("");
  const [skipProcessed, setSkipProcessed] = useState(true);

  // Activity states
  const [isCrawling, setIsCrawling] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load crawling settings when the selected version changes
  useEffect(() => {
    if (selectedVersion) {
      fetchCrawlingSettings(selectedVersion.id);
    }
  }, [selectedVersion, fetchCrawlingSettings]);

  // Update form state when settings change
  useEffect(() => {
    if (currentCrawlingSettings) {
      console.log(
        "Updating form from currentCrawlingSettings:",
        currentCrawlingSettings
      );

      // Initialize form fields with values from backend or empty strings if null
      setPrefixPath(currentCrawlingSettings.prefixPath || "");
      setAntiPaths(currentCrawlingSettings.antiPaths || "");
      setAntiKeywords(currentCrawlingSettings.antiKeywords || "");
      // Also initialize skipProcessed from backend or default to true
      setSkipProcessed(currentCrawlingSettings.skipProcessed !== false);

      console.log("Setting form values:", {
        prefixPath: currentCrawlingSettings.prefixPath || "",
        antiPaths: currentCrawlingSettings.antiPaths || "",
        antiKeywords: currentCrawlingSettings.antiKeywords || "",
        skipProcessed: currentCrawlingSettings.skipProcessed !== false,
      });

      // If we don't have a start URL yet, use the prefix path if it exists
      if (!startUrl && currentCrawlingSettings.prefixPath) {
        setStartUrl(currentCrawlingSettings.prefixPath);
      }
    } else if (selectedVersion) {
      // Initialize with empty values when no settings exist
      setPrefixPath("");
      setAntiPaths("");
      setAntiKeywords("");
      // Don't reset startUrl here to avoid clearing user input
    }
  }, [currentCrawlingSettings, startUrl, selectedVersion]);

  // Handle refreshing crawl settings from the backend
  const handleRefreshSettings = async () => {
    if (!selectedVersion) return;

    setIsRefreshing(true);
    try {
      await fetchCrawlingSettings(selectedVersion.id);
      toast.success("Crawl settings refreshed", {
        description: "Latest configuration loaded successfully",
      });
    } catch (error) {
      console.error("Error refreshing crawl settings:", error);
      toast.error("Failed to refresh settings", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle save settings
  const handleSaveSettings = async () => {
    if (!selectedVersion) return;

    try {
      console.log("Saving settings for version:", selectedVersion.id);
      console.log("Current crawling settings:", currentCrawlingSettings);

      // Prepare settings object properly
      // Note: Backend expects empty strings to be sent as empty strings, not nulls
      const settings = {
        id: currentCrawlingSettings?.id,
        versionId: selectedVersion.id,
        prefixPath: prefixPath.trim(), // Trim to remove any leading/trailing whitespace
        antiPaths: antiPaths.trim(),
        antiKeywords: antiKeywords.trim(),
        skipProcessed: skipProcessed, // Add skipProcessed to saved settings
      };

      console.log("Sending settings:", settings);

      const saveResult = await saveCrawlingSettings(settings);

      console.log("Save result:", saveResult);

      toast.success("Settings saved", {
        description: "Crawling configuration has been updated",
      });

      // Refresh settings after save
      await fetchCrawlingSettings(selectedVersion.id);
    } catch (error) {
      console.error("Failed to save crawling settings:", error);
      toast.error("Failed to save settings", {
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  };

  // Handle apply filters
  const handleApplyFilters = async () => {
    if (!selectedVersion) return;

    // Save current settings first to ensure the latest anti-keywords are used
    await handleSaveSettings();

    setIsFiltering(true);
    try {
      const deletedCount = await applyUrlFilters(selectedVersion.id);
      toast.success("Filters applied", {
        description: `${deletedCount} URLs have been deleted based on filter criteria`,
      });
    } catch (error) {
      console.error("Error applying filters:", error);
    } finally {
      setIsFiltering(false);
    }
  };

  // Handle start crawling
  const handleStartCrawling = async () => {
    if (!selectedTechnology || !selectedVersion || !startUrl) return;

    console.log("🔵 CRAWL START: Beginning crawl request for", startUrl);
    setIsCrawling(true);

    // Create a flag to track if we've already reset the state
    let hasReset = false;

    // Function to safely reset the crawling state once
    const resetCrawlingState = () => {
      if (!hasReset) {
        hasReset = true;
        setIsCrawling(false);
        console.log("🔵 CRAWL UI: Reset crawling button state");
      }
    };

    try {
      // Create channel for event communication
      const onEvent = new Channel<CrawlEvent>();

      // Set up focused event handler to track crawling progress
      onEvent.onmessage = (message) => {
        // Only log important events, not every URL discovered
        if (message.event === "finished") {
          console.log("🟢 CRAWL FINISHED:", message.data);
          resetCrawlingState();

          // Add a delay before showing completion toast to prevent overriding the start toast
          setTimeout(() => {
            toast.success("Crawling completed", {
              description: `Discovered ${message.data.totalUrls} URLs`,
            });
          }, 1500);
        } else if (message.event === "error") {
          console.error("🔴 CRAWL ERROR:", message.data.message);
          resetCrawlingState();

          toast.error("Crawling error", {
            description: message.data.message,
          });
        }
      };

      console.log("🔵 CRAWL API: Sending request to start crawling");

      // Start crawling with the channel using current form values
      const taskId = await startCrawling({
        technologyId: selectedTechnology.id,
        versionId: selectedVersion.id,
        startUrl: startUrl,
        prefixPath: prefixPath,
        antiPaths: antiPaths
          ? antiPaths.split(",").map((p) => p.trim())
          : undefined,
        antiKeywords: antiKeywords
          ? antiKeywords.split(",").map((k) => k.trim())
          : undefined,
        skipProcessedUrls: skipProcessed,
        onEvent: onEvent,
      });

      console.log(
        "🟢 CRAWL API: Request completed successfully with taskId:",
        taskId
      );

      // Show toast for task start - explicitly set a longer duration
      toast.success("Crawling successfully started", {
        description: `Now crawling URLs for ${selectedTechnology.name} ${selectedVersion.version}`,
        duration: 4000, // Show for 4 seconds
      });

      // Reset crawling state immediately after successful start
      resetCrawlingState();

      // For safety, set a timeout to reset the button state after 30 seconds
      // in case the 'finished' event is never received
      setTimeout(() => {
        resetCrawlingState();
      }, 30000);
    } catch (error) {
      console.error("🔴 CRAWL ERROR: Failed to start crawling", error);
      toast.error("Crawling failed", {
        description:
          error instanceof Error ? error.message : "Failed to start crawling",
      });
      resetCrawlingState();
    }
  };

  // Don't render if no version is selected
  if (!selectedVersion) return null;

  return (
    <GlassContainer
      depth="deep"
      className="p-6"
      withNoise
      depthLevel={2}
      animate
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Crawl Configuration</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshSettings}
          disabled={isRefreshing}
          className="flex items-center gap-1.5"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh Settings
        </Button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start-url">Start URL</Label>
            <Input
              id="start-url"
              placeholder="https://example.com/docs"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              className="glass-input"
            />
            <p className="text-xs text-muted-foreground">
              The URL where crawling will begin
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prefix-path">URL Prefix Path</Label>
            <Input
              id="prefix-path"
              placeholder="https://example.com/docs"
              value={prefixPath}
              onChange={(e) => setPrefixPath(e.target.value)}
              className="glass-input"
            />
            <p className="text-xs text-muted-foreground">
              Only URLs starting with this prefix will be crawled
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="anti-paths">Excluded Paths</Label>
            <Input
              id="anti-paths"
              placeholder="blog, community, legacy"
              value={antiPaths}
              onChange={(e) => setAntiPaths(e.target.value)}
              className="glass-input"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of paths to exclude from crawling
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="anti-keywords">Excluded Keywords</Label>
            <Input
              id="anti-keywords"
              placeholder="legacy, deprecated, experimental"
              value={antiKeywords}
              onChange={(e) => setAntiKeywords(e.target.value)}
              className="glass-input"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of keywords to exclude from crawling
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center glass-depth-1 px-2 py-1 rounded-md text-xs">
            <Switch
              id="skip-processed"
              checked={skipProcessed}
              onCheckedChange={(checked) => {
                console.log("Toggle skipProcessed to:", checked);
                setSkipProcessed(checked);
              }}
              className={
                skipProcessed
                  ? "glass-bioluminescent bg-blue-500/80 border-blue-400"
                  : "bg-blue-900/50 border-blue-800/50"
              }
            />
            <label
              htmlFor="skip-processed"
              className="cursor-pointer flex items-center gap-1 ml-1"
            >
              <span>Skip previously processed URLs</span>
            </label>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          Remember to save your settings before starting a crawl operation. The
          exclusion filters apply to all URLs discovered during crawling.
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            onClick={handleSaveSettings}
            disabled={isLoading}
            variant="outline"
            className="glass-surface"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>

          <Button
            onClick={handleApplyFilters}
            disabled={isFiltering || isLoading}
            variant="outline"
            className="glass-surface"
          >
            {isFiltering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Filter className="h-4 w-4 mr-2" />
            )}
            Apply Filters
          </Button>

          <Button
            onClick={handleStartCrawling}
            disabled={isCrawling || !startUrl || isLoading}
            className="glass-button glass-current"
          >
            {isCrawling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start Crawling
          </Button>
        </div>
      </div>
    </GlassContainer>
  );
}
