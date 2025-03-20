import { Button } from "@/components/ui/button";
import { GlassContainer } from "@/components/ui/glass-container";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUrlStore } from "@/stores/url-store";
import { Filter, Loader2, Play, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Channel } from "@tauri-apps/api/core";
import { CrawlEvent } from "@/types/events";

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

      setPrefixPath(currentCrawlingSettings.prefixPath || "");
      setAntiPaths(currentCrawlingSettings.antiPaths || "");
      setAntiKeywords(currentCrawlingSettings.antiKeywords || "");

      console.log("Setting form values:", {
        prefixPath: currentCrawlingSettings.prefixPath || "",
        antiPaths: currentCrawlingSettings.antiPaths || "",
        antiKeywords: currentCrawlingSettings.antiKeywords || "",
      });

      // If we don't have a start URL yet, use the prefix path
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

  // Handle save settings
  const handleSaveSettings = async () => {
    if (!selectedVersion) return;

    try {
      console.log("Saving settings for version:", selectedVersion.id);
      console.log("Current crawling settings:", currentCrawlingSettings);

      // Make sure we're passing all fields needed
      const settings = {
        id: currentCrawlingSettings?.id,
        versionId: selectedVersion.id,
        prefixPath: prefixPath || "",
        antiPaths: antiPaths || "",
        antiKeywords: antiKeywords || "",
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

    setIsFiltering(true);
    try {
      const skippedCount = await applyUrlFilters(selectedVersion.id);
      toast.success("Filters applied", {
        description: `${skippedCount} URLs have been marked as skipped`,
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

    setIsCrawling(true);
    try {
      // Save settings first
      await handleSaveSettings();

      // Create channel for event communication
      const onEvent = new Channel<CrawlEvent>();

      // Start crawling with the channel
      await startCrawling({
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
    } catch (error) {
      console.error("Error starting crawl:", error);
      toast.error("Crawling failed", {
        description:
          error instanceof Error ? error.message : "Failed to start crawling",
      });
    } finally {
      setIsCrawling(false);
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
      <h2 className="text-xl font-semibold mb-4">Crawl Configuration</h2>

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
          <Switch
            checked={skipProcessed}
            onCheckedChange={setSkipProcessed}
            id="skip-processed"
          />
          <Label htmlFor="skip-processed">Skip previously processed URLs</Label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleSaveSettings}
            disabled={isLoading}
            variant="outline"
            className="glass-surface"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>

          <Button
            onClick={handleApplyFilters}
            disabled={isLoading || isFiltering}
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
            disabled={!startUrl || isLoading || isCrawling}
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
