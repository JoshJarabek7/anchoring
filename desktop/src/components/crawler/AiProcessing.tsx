import { useState, useEffect } from "react";
import { toast } from "sonner";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "../ui/card";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Switch } from "../ui/switch";
import { getURLs, CrawlURL, getProcessingSettings, saveProcessingSettings } from "../../lib/db";
import ProcessingPipeline from "./ProcessingPipeline";
import { DocumentationCategory } from "../../lib/db";
import { Badge } from "../ui/badge";
import { useProcessedUrls } from "../../hooks/useProcessedUrls";
import { useSnippets } from "../../hooks/useSnippets";
import SnippetViewer from "./SnippetViewer";
import { useVectorDB } from "../../hooks/useVectorDB";

interface AiProcessingProps {
  sessionId: number;
  apiKey: string;
}

// Update the PreviewSnippets component to be clickable and show snippet count
const PreviewSnippets = ({ 
  url, 
  onClick,
  snippetCount = null 
}: { 
  url: string; 
  onClick: (url: string) => void; 
  snippetCount?: number | null;
}) => {
  return (
    <div 
      className="p-3 border rounded-md bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={() => onClick(url)}
    >
      <div className="flex justify-between items-start">
        <h4 className="font-medium">{url}</h4>
        {snippetCount !== null && (
          <Badge variant="outline" className="ml-2">
            {snippetCount} {snippetCount === 1 ? 'snippet' : 'snippets'}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Click to view snippets
      </p>
    </div>
  );
};

export default function AiProcessing({ sessionId, apiKey }: AiProcessingProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [totalToProcess, setTotalToProcess] = useState<number>(0);
  const [settings, setSettings] = useState<{
    language?: string | undefined;
    languageVersion?: string | undefined;
    framework?: string | undefined;
    frameworkVersion?: string | undefined;
    library?: string | undefined;
    libraryVersion?: string | undefined;
  }>({});
  const [urls, setUrls] = useState<CrawlURL[]>([]);
  const [filteredUrls, setFilteredUrls] = useState<CrawlURL[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState<boolean>(false);
  const [processedUrls, setProcessedUrls] = useState<string[]>([]);
  const [snippetsVisible, setSnippetsVisible] = useState<{ [key: string]: boolean }>({});
  const [filter, setFilter] = useState<string>("");
  const [includeProcessed, setIncludeProcessed] = useState<boolean>(true); // Default to showing all URLs
  const [aiSystem, setAiSystem] = useState<string>("You are a documentation expert...");
  const [prompt, setPrompt] = useState<string>("Extract documentation snippets...");
  const [processingStopped, setProcessingStopped] = useState<boolean>(false);
  
  // Check API key on component mount
  useEffect(() => {
    console.log("AiProcessing component mounted with API key:", apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 4)}` : "No API key provided");
    
    if (!apiKey) {
      toast.error("OpenAI API key is missing. Please add your API key in Settings.", {
        id: "api-key-missing-init",
        duration: 5000,
      });
    }
  }, [apiKey]);
  
  // Pagination state
  const [allUrls, setAllUrls] = useState<CrawlURL[]>([]);
  const [page, setPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const URLS_PER_PAGE = 50; // Number of URLs to display per page
  
  // Use our custom hook to manage processed URLs
  const {
    processedUrls: customProcessedUrls,
    getSnippetCount,
    markUrlsAsProcessed
  } = useProcessedUrls(sessionId);
  
  // Add the snippets hook for viewing snippets
  const {
    snippets,
    loading: loadingSnippets,
    error: snippetsError,
    selectedUrl,
    fetchSnippets,
    clearSnippets
  } = useSnippets(sessionId);
  
  // Add new state for category selection
  const [selectedCategories, setSelectedCategories] = useState<{
    language: boolean;
    framework: boolean;
    library: boolean;
  }>({
    language: false,
    framework: false,
    library: false
  });
  
  // No cleanup needed - toasts auto-dismiss
  
  // Helper function to handle input changes properly
  const handleInputChange = (field: string, value: string) => {
    setSettings(prev => {
      // Just update with the new value
      return { ...prev, [field]: value };
    });
  };
  
  // Load AI processing settings for the current session
  const loadAiProcessingSettings = async () => {
    if (!sessionId) return;
    
    try {
      console.log(`Loading processing settings for session ${sessionId}`);
      
      // Get session-specific settings from the database
      const sessionSettings = await getProcessingSettings(sessionId);
      console.log("Retrieved session settings:", sessionSettings);
      
      if (sessionSettings) {
        // Create a new settings object to replace the current one
        const newSettings = {
          language: sessionSettings.language || undefined,
          languageVersion: sessionSettings.language_version || undefined,
          framework: sessionSettings.framework || undefined,
          frameworkVersion: sessionSettings.framework_version || undefined,
          library: sessionSettings.library || undefined,
          libraryVersion: sessionSettings.library_version || undefined
        };
        
        // Set all settings at once to avoid controlled/uncontrolled input warnings
        setSettings(newSettings);
        
        // Update the category checkboxes based on the category field
        // If category is set, use it to determine which checkbox should be selected
        if (sessionSettings.category) {
          setSelectedCategories({
            language: sessionSettings.category === DocumentationCategory.LANGUAGE,
            framework: sessionSettings.category === DocumentationCategory.FRAMEWORK,
            library: sessionSettings.category === DocumentationCategory.LIBRARY
          });
        } else {
          // For backward compatibility: set based on presence of values
          setSelectedCategories({
            language: !!sessionSettings.language,
            framework: !!sessionSettings.framework,
            library: !!sessionSettings.library
          });
        }
      } else {
        // If no settings found, use empty settings
        setSettings({
          language: undefined,
          languageVersion: undefined,
          framework: undefined,
          frameworkVersion: undefined,
          library: undefined,
          libraryVersion: undefined
        });
        setSelectedCategories({
          language: false,
          framework: false,
          library: false
        });
      }
    } catch (error) {
      console.error("Failed to load AI processing settings:", error);
      toast.error("Failed to load processing settings for this session");
    }
  };
  
  // Save AI processing settings when they change
  const saveAiProcessingSettings = async () => {
    if (!sessionId) {
      toast.error("No session selected");
      return;
    }
    
    try {
      setLoading(true);
      
      // Validate based on selected category
      let isValid = true;
      let missingFields: string[] = [];
      
      // Updated validation logic: Only validate fields for selected categories
      if (selectedCategories.language) {
        if (!settings.language) {
          isValid = false;
          missingFields.push("Language Name");
        }
        if (!settings.languageVersion) {
          isValid = false;
          missingFields.push("Language Version");
        }
      }
      
      if (selectedCategories.framework) {
        if (!settings.framework) {
          isValid = false;
          missingFields.push("Framework Name");
        }
        if (!settings.frameworkVersion) {
          isValid = false;
          missingFields.push("Framework Version");
        }
      }
      
      if (selectedCategories.library) {
        if (!settings.library) {
          isValid = false;
          missingFields.push("Library Name");
        }
        if (!settings.libraryVersion) {
          isValid = false;
          missingFields.push("Library Version");
        }
      }
      
      // Ensure at least one category is selected
      if (!selectedCategories.language && !selectedCategories.framework && !selectedCategories.library) {
        isValid = false;
        missingFields.push("At least one Documentation Category");
      }
      
      if (!isValid) {
        toast.error(`Missing required fields: ${missingFields.join(", ")}`);
        return;
      }
      
      // Save settings to the database for this specific session
      // Save all field values but mark the category
      await saveProcessingSettings({
        session_id: sessionId,
        language: settings.language,
        language_version: settings.languageVersion,
        framework: settings.framework,
        framework_version: settings.frameworkVersion,
        library: settings.library,
        library_version: settings.libraryVersion,
        // Add a metadata field to indicate which is the category
        category: selectedCategories.language 
          ? DocumentationCategory.LANGUAGE 
          : selectedCategories.framework 
            ? DocumentationCategory.FRAMEWORK 
            : DocumentationCategory.LIBRARY
      });
      
      toast.success("AI processing settings saved successfully");
    } catch (error) {
      console.error("Failed to save AI processing settings:", error);
      toast.error("Failed to save AI processing settings");
    } finally {
      setLoading(false);
    }
  };
  
  const loadURLs = async () => {
    try {
      setLoading(true);
      // Always include content, but we'll only be using the markdown field
      const data = await getURLs(sessionId, true);
      
      // Filter URLs based on the includeProcessed setting
      let availableUrls = data.filter(url => {
        // Only include URLs that have markdown content
        if (!url.markdown) return false;
        
        // If includeProcessed is true, show both crawled AND processed URLs
        if (includeProcessed) {
          return url.status === "crawled" || url.status === "processed" || url.status === "pending";
        }
        
        // Otherwise, only show crawled URLs that have not been processed
        return (url.status === "crawled" || url.status === "pending") && !customProcessedUrls.includes(url.url);
      });
      
      // Keep all filtered URLs in state
      setAllUrls(availableUrls);
      
      // Apply pagination to the filtered URLs
      const paginatedUrls = availableUrls.slice(0, URLS_PER_PAGE);
      setUrls(paginatedUrls);
      setFilteredUrls(paginatedUrls);
      
      // Set hasMore flag if we have more URLs than the current page shows
      setHasMore(availableUrls.length > URLS_PER_PAGE);
      
      // Reset page number
      setPage(1);
      
      // Load AI processing settings for this session
      await loadAiProcessingSettings();
    } catch (error) {
      console.error("Failed to load URLs:", error);
      toast.error("Failed to load crawled URLs");
    } finally {
      setLoading(false);
    }
  };
  
  // Handle loading more URLs when the "Load More" button is clicked
  const loadMoreUrls = () => {
    setLoadingMore(true);
    
    // Calculate next page of URLs
    const nextPage = page + 1;
    const startIdx = (nextPage - 1) * URLS_PER_PAGE;
    const endIdx = nextPage * URLS_PER_PAGE;
    
    // Filter all URLs based on the current filter
    const filteredAllUrls = filter ? 
      allUrls.filter(url => url.url.toLowerCase().includes(filter.toLowerCase())) : 
      allUrls;
    
    // Get the next page of URLs
    const nextPageUrls = filteredAllUrls.slice(startIdx, endIdx);
    
    // Update state
    setUrls(prevUrls => [...prevUrls, ...nextPageUrls]);
    setFilteredUrls(prevFilteredUrls => [...prevFilteredUrls, ...nextPageUrls]);
    setPage(nextPage);
    setHasMore(endIdx < filteredAllUrls.length);
    setLoadingMore(false);
  };
  
  useEffect(() => {
    if (sessionId) {
      // Load URLs for the new session (which will also load settings)
      loadURLs();
    }
  }, [sessionId]); // Only respond to sessionId changes
  
  useEffect(() => {
    if (sessionId) {
      // Reload URLs when these dependencies change
      loadURLs();
    }
  }, [customProcessedUrls, includeProcessed]); // Re-run when these change
  
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setFilter(value);
    
    if (!value) {
      // Reset to first page of all URLs
      setFilteredUrls(allUrls.slice(0, URLS_PER_PAGE));
      setPage(1);
      setHasMore(allUrls.length > URLS_PER_PAGE);
    } else {
      // Filter all URLs and apply pagination
      const filtered = allUrls.filter(url => 
        url.url.toLowerCase().includes(value)
      );
      setFilteredUrls(filtered.slice(0, URLS_PER_PAGE));
      setPage(1);
      setHasMore(filtered.length > URLS_PER_PAGE);
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
  
  // Toggle includeProcessed setting
  const handleToggleIncludeProcessed = () => {
    // Toggle the setting - the useEffect hook will handle the data fetching
    setIncludeProcessed(prev => !prev);
    
    // Clear selections when the filter changes
    setSelectedUrls([]);
    setSelectAll(false);
    
    // No need to manually reload URLs here - it happens in the useEffect
    // that depends on includeProcessed
  };
  
  const handleSelectURL = (url: string, checked: boolean) => {
    if (checked) {
      setSelectedUrls(prev => [...prev, url]);
    } else {
      setSelectedUrls(prev => prev.filter(u => u !== url));
    }
  };
  
  const handleStartProcessing = () => {
    if (!apiKey) {
      toast.error("Please add your OpenAI API key in Settings", {
        id: "api-key-missing", // Use unique ID to prevent duplicates
      });
      return;
    }
    
    // This check should not be needed since the button is disabled in this case,
    // but we'll keep it as a safeguard without showing duplicated toasts
    if (selectedUrls.length === 0) {
      // Only show toast if URLs exist but none are selected
      if (filteredUrls.length > 0) {
        toast.error("Please select at least one URL to process", {
          id: "no-urls-selected", // Use unique ID to prevent duplicates
        });
      }
      return;
    }
    
    setProcessing(true);
  };
  
  const handleProcessingComplete = async (results: any) => {
    // Get the URLs that were successfully processed
    const newProcessedUrls = results
      .filter((result: any) => result.success)
      .map((result: any) => result.url);
    
    // Mark them as processed in the database and update our state
    await markUrlsAsProcessed(newProcessedUrls);
    
    // Only show toast for small batches to reduce notification overload
    if (newProcessedUrls.length <= 3) {
      toast.success(`Processed ${newProcessedUrls.length} URLs successfully`, { 
        duration: 2000,
        id: "processing-success" // Use unique ID to prevent duplicates
      });
    }
    
    // Instead of reloading all URLs, just update our state to avoid a full refresh
    // This makes the UI more reactive without losing position
    setUrls(prev => prev.filter(url => !newProcessedUrls.includes(url.url)));
    setFilteredUrls(prev => prev.filter(url => !newProcessedUrls.includes(url.url)));
    
    setProcessing(false);
    setSelectedUrls([]);
  };
  
  const handleProcessingCancel = () => {
    setProcessing(false);
  };
  
  // Calculate the selected URLs with their markdown content
  const selectedUrlsWithContent = urls
    .filter(url => selectedUrls.includes(url.url) && url.markdown)
    .map(url => ({
      // Make sure id is always a number to match the required type
      id: url.id || 0, 
      url: url.url,
      markdown: url.markdown || ""
    }));
  
  useEffect(() => {
    // Update selectAll state when selectedUrls or filteredUrls change
    setSelectAll(
      filteredUrls.length > 0 && 
      selectedUrls.length === filteredUrls.length
    );
  }, [selectedUrls, filteredUrls]);
  
  // Render URL list with processing status indicators
  const renderURLList = () => {
    if (loading) {
      return <div className="text-center py-4">Loading URLs...</div>;
    }
    
    if (filteredUrls.length === 0) {
      return <div className="text-center py-4">No crawled URLs found for this session</div>;
    }
    
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center space-x-2">
              <Switch 
                id="include-processed" 
                checked={includeProcessed}
                onCheckedChange={handleToggleIncludeProcessed}
              />
              <Label htmlFor="include-processed">Include already processed URLs</Label>
            </div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSelectAll}
              disabled={filteredUrls.length === 0}
            >
              {selectAll ? "Deselect All" : "Select All"}
            </Button>
          </div>
          
          <Input
            placeholder="Filter URLs..."
            value={filter}
            onChange={handleFilterChange}
            className="mb-2"
          />
          
          <div className="flex flex-wrap justify-between text-sm text-muted-foreground mb-2 gap-2">
            <div className="flex gap-3">
              <span>Total: {filteredUrls.length} URLs</span>
              {includeProcessed && (
                <span>
                  Processed: {filteredUrls.filter(url => url.status === "processed" || customProcessedUrls.includes(url.url)).length}
                </span>
              )}
            </div>
            <span>Selected: {selectedUrls.length}</span>
          </div>
          
          <ScrollArea className="h-[600px] border rounded-md">
            {filteredUrls.map(url => {
              // URL is processed if its status is 'processed' OR it's in the processedUrls list
              const isProcessed = url.status === "processed" || customProcessedUrls.includes(url.url);
              
              return (
                <div 
                  key={url.url} 
                  className={`flex items-center space-x-2 p-2 border rounded ${
                    isProcessed ? 'bg-green-50 dark:bg-green-950 border-green-200' : 'hover:bg-muted/30'
                  }`}
                >
                  <Checkbox
                    id={`url-${url.url}`}
                    checked={selectedUrls.includes(url.url)}
                    onCheckedChange={(checked) => handleSelectURL(url.url, checked === true)}
                  />
                  <label 
                    htmlFor={`url-${url.url}`}
                    className="flex-1 text-sm cursor-pointer truncate"
                    title={url.url}
                  >
                    <div className="flex items-center">
                      <span className="truncate">{url.url}</span>
                      {isProcessed && (
                        <Badge 
                          variant="outline" 
                          className="ml-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 text-xs"
                        >
                          {includeProcessed ? "Reprocess" : "Processed"}
                        </Badge>
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </ScrollArea>
          
          <div className="flex justify-end">
            <Button 
              onClick={handleStartProcessing}
              disabled={selectedUrls.length === 0 || loading}
            >
              Process Selected URLs
            </Button>
          </div>
        </div>
        
        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              onClick={loadMoreUrls}
              disabled={loadingMore}
              className="w-full max-w-[300px]"
            >
              {loadingMore ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                  Loading...
                </>
              ) : (
                `Load More URLs (${filteredUrls.length} of ${filter ? allUrls.filter(url => url.url.toLowerCase().includes(filter.toLowerCase())).length : allUrls.length})`
              )}
            </Button>
          </div>
        )}
      </div>
    );
  };
  
  if (!sessionId) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>AI Processing</CardTitle>
          <CardDescription>
            Process crawled content with AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center py-4">Please select a session first</p>
        </CardContent>
      </Card>
    );
  }
  
  // Use the real ProcessingPipeline component
  if (processing) {
    return (
      <ProcessingPipeline
        urls={selectedUrlsWithContent}
        apiKey={apiKey}
        sessionId={sessionId}
        category={
          selectedCategories.language 
            ? DocumentationCategory.LANGUAGE 
            : selectedCategories.framework 
              ? DocumentationCategory.FRAMEWORK 
              : DocumentationCategory.LIBRARY
        }
        language={settings.language}
        languageVersion={settings.languageVersion}
        framework={settings.framework}
        frameworkVersion={settings.frameworkVersion}
        library={settings.library}
        libraryVersion={settings.libraryVersion}
        onComplete={handleProcessingComplete}
        onCancel={handleProcessingCancel}
      />
    );
  }
  
  // In the non-processing UI return, replace with the tabbed interface
  if (!processing) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>AI Processing</CardTitle>
          <CardDescription>
            Process crawled content into documentation snippets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Category Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Documentation Category</Label>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-language"
                    checked={selectedCategories.language}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Radio button behavior - only one can be selected
                        setSelectedCategories({
                          language: true,
                          framework: false,
                          library: false
                        });
                      } else {
                        // Allow unchecking
                        setSelectedCategories(prev => ({ ...prev, language: false }));
                      }
                    }}
                  />
                  <label htmlFor="category-language">Language</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-framework"
                    checked={selectedCategories.framework}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Radio button behavior - only one can be selected
                        setSelectedCategories({
                          language: false,
                          framework: true,
                          library: false
                        });
                      } else {
                        // Allow unchecking
                        setSelectedCategories(prev => ({ ...prev, framework: false }));
                      }
                    }}
                  />
                  <label htmlFor="category-framework">Framework</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-library"
                    checked={selectedCategories.library}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Radio button behavior - only one can be selected
                        setSelectedCategories({
                          language: false,
                          framework: false,
                          library: true
                        });
                      } else {
                        // Allow unchecking
                        setSelectedCategories(prev => ({ ...prev, library: false }));
                      }
                    }}
                  />
                  <label htmlFor="category-library">Library</label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Input 
                  id="language" 
                  value={settings.language}
                  onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                  placeholder="Enter programming language"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="languageVersion">Language Version</Label>
                <Input 
                  id="languageVersion" 
                  value={settings.languageVersion}
                  onChange={(e) => setSettings(prev => ({ ...prev, languageVersion: e.target.value }))}
                  placeholder="Enter language version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <Input 
                  id="framework" 
                  value={settings.framework}
                  onChange={(e) => setSettings(prev => ({ ...prev, framework: e.target.value }))}
                  placeholder="Enter framework name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frameworkVersion">Framework Version</Label>
                <Input 
                  id="frameworkVersion" 
                  value={settings.frameworkVersion}
                  onChange={(e) => setSettings(prev => ({ ...prev, frameworkVersion: e.target.value }))}
                  placeholder="Enter framework version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="library">Library</Label>
                <Input 
                  id="library" 
                  value={settings.library || ""}
                  onChange={(e) => handleInputChange('library', e.target.value)}
                  placeholder="Enter library name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="libraryVersion">Library Version</Label>
                <Input 
                  id="libraryVersion" 
                  value={settings.libraryVersion || ""}
                  onChange={(e) => handleInputChange('libraryVersion', e.target.value)}
                  placeholder="Enter library version"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={saveAiProcessingSettings}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
          
          {/* Tabbed Interface for URLs */}
          <Tabs defaultValue="to-process" className="w-full">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="to-process">URLs to Process</TabsTrigger>
              <TabsTrigger value="processed" className="relative">
                Processed URLs
                {customProcessedUrls.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {customProcessedUrls.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="to-process" className="space-y-4">
              {renderURLList()}
            </TabsContent>
            
            <TabsContent value="processed" className="space-y-4">
              {selectedUrl ? (
                <SnippetViewer
                  url={selectedUrl}
                  snippets={snippets}
                  loading={loadingSnippets}
                  error={snippetsError}
                  onBack={clearSnippets}
                />
              ) : (
                <>
                  {customProcessedUrls.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No URLs have been processed yet
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        These URLs have been processed and their snippets are now stored in ChromaDB.
                        Click on a URL to view its snippets.
                      </p>
                      
                      <ScrollArea className="h-[500px] border rounded-md p-3">
                        <div className="space-y-3">
                          {customProcessedUrls.map((url) => (
                            <PreviewSnippets 
                              key={url} 
                              url={url} 
                              onClick={fetchSnippets} 
                              snippetCount={getSnippetCount(url)}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Processing</CardTitle>
          <CardDescription>
            Process crawled content into documentation snippets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Documentation Category</Label>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-language"
                    checked={selectedCategories.language}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Radio button behavior - only one can be selected
                        setSelectedCategories({
                          language: true,
                          framework: false,
                          library: false
                        });
                      } else {
                        // Allow unchecking
                        setSelectedCategories(prev => ({ ...prev, language: false }));
                      }
                    }}
                  />
                  <label htmlFor="category-language">Language</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-framework"
                    checked={selectedCategories.framework}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Radio button behavior - only one can be selected
                        setSelectedCategories({
                          language: false,
                          framework: true,
                          library: false
                        });
                      } else {
                        // Allow unchecking
                        setSelectedCategories(prev => ({ ...prev, framework: false }));
                      }
                    }}
                  />
                  <label htmlFor="category-framework">Framework</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-library"
                    checked={selectedCategories.library}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Radio button behavior - only one can be selected
                        setSelectedCategories({
                          language: false,
                          framework: false,
                          library: true
                        });
                      } else {
                        // Allow unchecking
                        setSelectedCategories(prev => ({ ...prev, library: false }));
                      }
                    }}
                  />
                  <label htmlFor="category-library">Library</label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Input 
                  id="language" 
                  value={settings.language}
                  onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                  placeholder="Enter programming language"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="languageVersion">Language Version</Label>
                <Input 
                  id="languageVersion" 
                  value={settings.languageVersion}
                  onChange={(e) => setSettings(prev => ({ ...prev, languageVersion: e.target.value }))}
                  placeholder="Enter language version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <Input 
                  id="framework" 
                  value={settings.framework}
                  onChange={(e) => setSettings(prev => ({ ...prev, framework: e.target.value }))}
                  placeholder="Enter framework name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frameworkVersion">Framework Version</Label>
                <Input 
                  id="frameworkVersion" 
                  value={settings.frameworkVersion}
                  onChange={(e) => setSettings(prev => ({ ...prev, frameworkVersion: e.target.value }))}
                  placeholder="Enter framework version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="library">Library</Label>
                <Input 
                  id="library" 
                  value={settings.library || ""}
                  onChange={(e) => handleInputChange('library', e.target.value)}
                  placeholder="Enter library name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="libraryVersion">Library Version</Label>
                <Input 
                  id="libraryVersion" 
                  value={settings.libraryVersion || ""}
                  onChange={(e) => handleInputChange('libraryVersion', e.target.value)}
                  placeholder="Enter library version"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={saveAiProcessingSettings}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Select URLs to Process</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleSelectAll}
              >
                {selectAll ? "Deselect All" : "Select All"}
              </Button>
            </div>
            
            <Input
              placeholder="Filter URLs..."
              value={filter}
              onChange={handleFilterChange}
              className="mb-2"
            />
            
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Total: {filteredUrls.length} URLs</span>
              <span>Selected: {selectedUrls.length}</span>
              <span>Already Processed: {customProcessedUrls.length}</span>
            </div>
            
            <ScrollArea className="h-[600px] border rounded-md">
              {renderURLList()}
            </ScrollArea>
          </div>
          
          <div className="flex justify-end">
            <Button 
              onClick={handleStartProcessing}
              disabled={selectedUrls.length === 0 || loading}
            >
              Process Selected URLs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}