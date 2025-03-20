import { Button } from "@/components/ui/button";
import { GlassContainer } from "@/components/ui/glass-container";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUrlStore } from "@/stores/url-store";
import { motion } from "framer-motion";
import { AlertCircle, Info, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Channel } from "@tauri-apps/api/core";
import { MarkdownEvent } from "@/types/events";

export function MarkdownCleaning() {
  const { selectedVersion } = useTechnologyStore();
  const { urls, selectedUrls, cleanMarkdown, isLoading } = useUrlStore();

  // Get crawled URLs that can be cleaned
  const eligibleUrls = urls.filter(
    (url) => url.status === "crawled" || url.status === "markdown_error"
  );

  // Get selected URLs that are eligible for cleaning
  const selectedEligibleUrls = eligibleUrls
    .filter((url) => selectedUrls.includes(url.id))
    .map((url) => url.id);

  // Handle clean markdown
  const handleCleanMarkdown = async () => {
    try {
      if (selectedEligibleUrls.length === 0) {
        toast.error("No eligible URLs selected", {
          description: 'Please select URLs with "crawled" status',
        });
        return;
      }

      // Create channel for event communication
      const onEvent = new Channel<MarkdownEvent>();

      // Clean markdown with the channel
      await cleanMarkdown(selectedEligibleUrls, onEvent);
    } catch (error) {
      console.error("Error cleaning markdown:", error);
      toast.error("Failed to clean markdown", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
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
        <h2 className="text-xl font-semibold">Markdown Cleaning</h2>

        <div className="text-sm text-muted-foreground">
          {eligibleUrls.length} eligible URLs
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-muted/30 p-4 rounded-lg flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <p className="text-sm">
              Markdown cleaning processes the raw HTML from crawled pages and
              converts it to clean, structured markdown for better readability
              and further processing.
            </p>

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Selected:</span>{" "}
              {selectedEligibleUrls.length} of {eligibleUrls.length} eligible
              URLs
            </div>
          </div>
        </div>

        {eligibleUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 py-2">
            {eligibleUrls.slice(0, 20).map((url, index) => (
              <motion.div
                key={url.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
                className={`
                  text-xs px-2 py-1 rounded-md truncate max-w-[200px] transition-colors
                  ${
                    selectedUrls.includes(url.id)
                      ? "bg-primary/40 glass-depth-1"
                      : "bg-muted"
                  }
                `}
                title={url.url}
              >
                {new URL(url.url).pathname}
              </motion.div>
            ))}
            {eligibleUrls.length > 20 && (
              <div className="text-xs px-2 py-1 bg-muted rounded-md">
                +{eligibleUrls.length - 20} more
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          {eligibleUrls.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertCircle className="h-4 w-4" />
              No URLs available for cleaning
            </div>
          ) : (
            <Button
              onClick={handleCleanMarkdown}
              disabled={selectedEligibleUrls.length === 0 || isLoading}
              className="glass-button glass-current"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Clean Selected ({selectedEligibleUrls.length})
            </Button>
          )}
        </div>
      </div>
    </GlassContainer>
  );
}
