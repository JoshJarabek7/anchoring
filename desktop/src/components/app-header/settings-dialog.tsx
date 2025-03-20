import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassContainer } from "@/components/ui/glass-container";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProxyStore } from "@/stores/proxy-store";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import React, { useEffect } from "react";
import { DialogCloseButton } from "./dialog-close-button";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = React.memo(
  ({ open, onOpenChange }: SettingsDialogProps) => {
    const { activeSettingsTab, setActiveSettingsTab } = useProxyStore();
    const { proxies, isLoading, fetchProxies, fetchAndSaveProxies } =
      useProxyStore();

    // Fetch proxies when the dialog is opened
    useEffect(() => {
      if (open && activeSettingsTab === "proxy") {
        fetchProxies();
      }
    }, [open, activeSettingsTab, fetchProxies]);

    const handleFetchProxies = React.useCallback(async () => {
      await fetchAndSaveProxies();
    }, [fetchAndSaveProxies]);

    // Keep this handler for programmatic closing
    const handleCloseDialog = React.useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-abyss sm:max-w-[600px] md:max-w-[800px] dialog-content">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-foreground font-semibold">
              Settings
            </DialogTitle>
            <DialogCloseButton onClick={handleCloseDialog} />
          </DialogHeader>

          <DialogDescription className="sr-only">
            Configure application settings and proxies
          </DialogDescription>

          <div className="flex-1 overflow-auto">
            <Tabs
              value={activeSettingsTab}
              onValueChange={setActiveSettingsTab}
              className="flex-1 flex flex-col"
            >
              <TabsList className="glass-depth-striations mx-1 text-foreground">
                <TabsTrigger value="proxy" className="text-foreground">
                  Proxies
                </TabsTrigger>
                {/* Add more settings tabs here in the future */}
              </TabsList>

              <TabsContent
                value="proxy"
                className="flex-1 flex flex-col mt-4 data-[state=inactive]:hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-foreground">
                    Proxy Management
                  </h3>
                  <div>
                    <Button
                      onClick={handleFetchProxies}
                      disabled={isLoading}
                      className="bg-blue-500 hover:bg-blue-600 font-medium text-white px-4 py-2 border-0 transition-colors"
                      size="sm"
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${
                          isLoading ? "animate-spin" : ""
                        }`}
                      />
                      Fetch New Proxies
                    </Button>
                  </div>
                </div>

                <GlassContainer
                  depth="deep"
                  className="flex-1 overflow-hidden p-0 border border-blue-200/30 dark:border-blue-800/30 shadow-lg"
                  withNoise
                >
                  <div className="overflow-fade-both">
                    <ScrollArea
                      className="h-auto max-h-[calc(85vh-18rem)]"
                      scrollHideDelay={0}
                    >
                      {proxies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px]">
                          <p className="text-foreground">
                            No proxies available
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 border border-blue-200/30 dark:border-blue-800/30"
                            onClick={handleFetchProxies}
                            disabled={isLoading}
                          >
                            <RefreshCw
                              className={`h-3 w-3 mr-2 ${
                                isLoading ? "animate-spin" : ""
                              }`}
                            />
                            Fetch Proxies
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <Table>
                            <TableHeader className="glass-surface border-b-2 border-blue-300/50 dark:border-blue-700/50">
                              <TableRow>
                                <TableHead className="text-foreground font-semibold text-sm bg-blue-200/70 dark:bg-blue-800/80 py-3">
                                  Proxy URL
                                </TableHead>
                                <TableHead className="w-[140px] text-foreground font-semibold text-sm bg-blue-200/70 dark:bg-blue-800/80 py-3">
                                  Last Used
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {proxies.slice(0, 10).map((proxy, index) => (
                                <TableRow
                                  key={proxy.id}
                                  className={`
                                transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-800/40
                                ${
                                  index % 2 === 0
                                    ? "bg-white/20 dark:bg-blue-950/30"
                                    : "bg-blue-50/30 dark:bg-blue-900/20"
                                }
                              `}
                                >
                                  <TableCell className="font-mono text-sm font-medium text-foreground border-b border-blue-200/30 dark:border-blue-800/30 py-2.5">
                                    <div className="flex items-center gap-2">
                                      {proxy.lastUsed ? (
                                        <Wifi className="h-4 w-4 text-green-500" />
                                      ) : (
                                        <WifiOff className="h-4 w-4 text-foreground/80" />
                                      )}
                                      {proxy.url}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm text-foreground border-b border-blue-200/30 dark:border-blue-800/30 py-2.5">
                                    {proxy.lastUsed
                                      ? formatDistanceToNow(
                                          new Date(proxy.lastUsed),
                                          { addSuffix: true }
                                        )
                                      : "Never"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </ScrollArea>

                    <div className="px-4 py-4 text-sm font-bold text-foreground flex items-center justify-between bg-blue-200/70 dark:bg-blue-700/70 border-t border-blue-300/60 dark:border-blue-600/60 shadow-inner">
                      <div className="flex items-center">
                        <span className="mr-1">Showing</span>
                        <span className="px-1.5 py-0.5 mx-1 bg-blue-500/20 dark:bg-blue-500/30 rounded text-blue-800 dark:text-blue-100">
                          {Math.min(10, proxies.length)}
                        </span>
                        <span className="mr-1">of</span>
                        <span className="px-1.5 py-0.5 mx-1 bg-blue-500/20 dark:bg-blue-500/30 rounded text-blue-800 dark:text-blue-100">
                          {proxies.length}
                        </span>
                        <span>proxies</span>
                      </div>
                      {proxies.length > 10 && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/50 dark:bg-blue-500/60 text-white font-medium shadow-sm">
                          Only first 10 loaded for performance
                        </span>
                      )}
                    </div>
                  </div>
                </GlassContainer>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

SettingsDialog.displayName = "SettingsDialog";
