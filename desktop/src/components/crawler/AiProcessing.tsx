import { useState, useEffect } from "react";
import { toast } from "@/components/ui/sonner";
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
import { getURLs, CrawlURL, getUserSettings, saveUserSettings, updateURLStatus } from "../../lib/db";
import ProcessingPipeline from "./ProcessingPipeline";
import { DocumentationCategory } from "../../lib/db";
import { Badge } from "../ui/badge";
import { useProcessedUrls } from "../../hooks/useProcessedUrls";
import { useSnippets } from "../../hooks/useSnippets";
import SnippetViewer from "./SnippetViewer";

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
  const [urls, setUrls] = useState<CrawlURL[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [filteredUrls, setFilteredUrls] = useState<CrawlURL[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [category, setCategory] = useState<DocumentationCategory>(DocumentationCategory.FRAMEWORK);
  const [language, setLanguage] = useState<string>("");
  const [languageVersion, setLanguageVersion] = useState<string>("");
  const [framework, setFramework] = useState<string>("");
  const [frameworkVersion, setFrameworkVersion] = useState<string>("");
  const [library, setLibrary] = useState<string>("");
  const [libraryVersion, setLibraryVersion] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [includeProcessed, setIncludeProcessed] = useState(false);
  
  // Use our custom hook to manage processed URLs
  const {
    processedUrls,
    getSnippetCount,
    loading: loadingProcessed,
    error: processedError,
    loadProcessedUrls,
    markUrlsAsProcessed
  } = useProcessedUrls(sessionId, apiKey);
  
  // Add the snippets hook for viewing snippets
  const {
    snippets,
    loading: loadingSnippets,
    error: snippetsError,
    selectedUrl,
    fetchSnippets,
    clearSnippets
  } = useSnippets(apiKey);
  
  // No cleanup needed - toasts auto-dismiss
  
  // Load saved AI processing settings
  const loadAiProcessingSettings = async () => {
    try {
      const settings = await getUserSettings();
      if (settings) {
        if (settings.language) setLanguage(settings.language);
        if (settings.language_version) setLanguageVersion(settings.language_version);
        if (settings.framework) setFramework(settings.framework);
        if (settings.framework_version) setFrameworkVersion(settings.framework_version);
        if (settings.library) setLibrary(settings.library);
        if (settings.library_version) setLibraryVersion(settings.library_version);
      }
    } catch (error) {
      console.error("Failed to load AI processing settings:", error);
    }
  };
  
  // Save AI processing settings when they change
  const saveAiProcessingSettings = async () => {
    try {
      setSaving(true);
      
      // Validate based on selected category
      let isValid = true;
      let missingFields: string[] = [];
      
      if (category === DocumentationCategory.LANGUAGE) {
        if (!language) {
          isValid = false;
          missingFields.push("Language");
        }
        if (!languageVersion) {
          isValid = false;
          missingFields.push("Language Version");
        }
      } else if (category === DocumentationCategory.FRAMEWORK) {
        if (!framework) {
          isValid = false;
          missingFields.push("Framework");
        }
        if (!frameworkVersion) {
          isValid = false;
          missingFields.push("Framework Version");
        }
      } else if (category === DocumentationCategory.LIBRARY) {
        if (!library) {
          isValid = false;
          missingFields.push("Library");
        }
        if (!libraryVersion) {
          isValid = false;
          missingFields.push("Library Version");
        }
      }
      
      if (!isValid) {
        toast.error(`Missing required fields: ${missingFields.join(", ")}`);
        return;
      }
      
      // Only include fields that have values
      const settingsToSave: any = {};
      
      // ALWAYS send all fields, even if empty (just set them to null if empty)
      // This ensures update queries actually include these fields
      settingsToSave.language = language || null;
      settingsToSave.language_version = languageVersion || null;
      settingsToSave.framework = framework || null;
      settingsToSave.framework_version = frameworkVersion || null;
      settingsToSave.library = library || null;
      settingsToSave.library_version = libraryVersion || null;
      
      console.log("About to save AI processing settings:", settingsToSave);
      
      // Save regardless of whether we have values
      await saveUserSettings(settingsToSave);
      console.log("Saved AI processing settings:", settingsToSave);
      toast.success("AI processing settings saved successfully");
    } catch (error) {
      console.error("Failed to save AI processing settings:", error);
      toast.error("Failed to save AI processing settings");
    } finally {
      setSaving(false);
    }
  };
  
  const loadURLs = async () => {
    try {
      setLoading(true);
      const data = await getURLs(sessionId);
      
      // Filter URLs based on the includeProcessed setting
      let availableUrls = data.filter(url => {
        // First make sure we have HTML content
        if (!url.html) return false;
        
        // If includeProcessed is true, show both crawled AND processed URLs
        if (includeProcessed) {
          return url.status === "crawled" || url.status === "processed";
        }
        
        // Otherwise, only show crawled URLs that have not been processed
        return url.status === "crawled" && !processedUrls.includes(url.url);
      });
      
      setUrls(availableUrls);
      setFilteredUrls(availableUrls);
      
      // Load AI processing settings after URLs are loaded
      await loadAiProcessingSettings();
    } catch (error) {
      console.error("Failed to load URLs:", error);
      toast.error("Failed to load crawled URLs");
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (sessionId) {
      loadURLs();
    }
  }, [sessionId, processedUrls, includeProcessed]); // Re-run when includeProcessed changes
  
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
  
  // Calculate the selected URLs with their HTML content
  const selectedUrlsWithContent = urls
    .filter(url => selectedUrls.includes(url.url) && url.html)
    .map(url => ({
      // Make sure id is always a number to match the required type
      id: url.id || 0, 
      url: url.url,
      html: url.html
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
      <div className="space-y-2">
        {filteredUrls.map(url => {
          // URL is processed if its status is 'processed' OR it's in the processedUrls list
          const isProcessed = url.status === "processed" || processedUrls.includes(url.url);
          
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
        category={category}
        language={language}
        languageVersion={languageVersion}
        framework={framework}
        frameworkVersion={frameworkVersion}
        library={library}
        libraryVersion={libraryVersion}
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
                    checked={category === DocumentationCategory.LANGUAGE}
                    onCheckedChange={() => setCategory(DocumentationCategory.LANGUAGE)}
                  />
                  <label htmlFor="category-language">Language</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-framework"
                    checked={category === DocumentationCategory.FRAMEWORK}
                    onCheckedChange={() => setCategory(DocumentationCategory.FRAMEWORK)}
                  />
                  <label htmlFor="category-framework">Framework</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-library"
                    checked={category === DocumentationCategory.LIBRARY}
                    onCheckedChange={() => setCategory(DocumentationCategory.LIBRARY)}
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
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="Enter programming language"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="languageVersion">Language Version</Label>
                <Input 
                  id="languageVersion" 
                  value={languageVersion}
                  onChange={(e) => setLanguageVersion(e.target.value)}
                  placeholder="Enter language version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <Input 
                  id="framework" 
                  value={framework}
                  onChange={(e) => setFramework(e.target.value)}
                  placeholder="Enter framework name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frameworkVersion">Framework Version</Label>
                <Input 
                  id="frameworkVersion" 
                  value={frameworkVersion}
                  onChange={(e) => setFrameworkVersion(e.target.value)}
                  placeholder="Enter framework version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="library">Library</Label>
                <Input 
                  id="library" 
                  value={library}
                  onChange={(e) => setLibrary(e.target.value)}
                  placeholder="Enter library name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="libraryVersion">Library Version</Label>
                <Input 
                  id="libraryVersion" 
                  value={libraryVersion}
                  onChange={(e) => setLibraryVersion(e.target.value)}
                  placeholder="Enter library version"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={saveAiProcessingSettings}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
          
          {/* Tabbed Interface for URLs */}
          <Tabs defaultValue="to-process" className="w-full">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="to-process">URLs to Process</TabsTrigger>
              <TabsTrigger value="processed" className="relative">
                Processed URLs
                {processedUrls.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {processedUrls.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="to-process" className="space-y-4">
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
                      Processed: {filteredUrls.filter(url => url.status === "processed" || processedUrls.includes(url.url)).length}
                    </span>
                  )}
                </div>
                <span>Selected: {selectedUrls.length}</span>
              </div>
              
              <ScrollArea className="h-[600px] border rounded-md">
                {renderURLList()}
              </ScrollArea>
              
              <div className="flex justify-end">
                <Button 
                  onClick={handleStartProcessing}
                  disabled={selectedUrls.length === 0 || loading}
                >
                  Process Selected URLs
                </Button>
              </div>
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
                  {processedUrls.length === 0 ? (
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
                          {processedUrls.map((url) => (
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
                    checked={category === DocumentationCategory.LANGUAGE}
                    onCheckedChange={() => setCategory(DocumentationCategory.LANGUAGE)}
                  />
                  <label htmlFor="category-language">Language</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-framework"
                    checked={category === DocumentationCategory.FRAMEWORK}
                    onCheckedChange={() => setCategory(DocumentationCategory.FRAMEWORK)}
                  />
                  <label htmlFor="category-framework">Framework</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="category-library"
                    checked={category === DocumentationCategory.LIBRARY}
                    onCheckedChange={() => setCategory(DocumentationCategory.LIBRARY)}
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
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="Enter programming language"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="languageVersion">Language Version</Label>
                <Input 
                  id="languageVersion" 
                  value={languageVersion}
                  onChange={(e) => setLanguageVersion(e.target.value)}
                  placeholder="Enter language version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <Input 
                  id="framework" 
                  value={framework}
                  onChange={(e) => setFramework(e.target.value)}
                  placeholder="Enter framework name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frameworkVersion">Framework Version</Label>
                <Input 
                  id="frameworkVersion" 
                  value={frameworkVersion}
                  onChange={(e) => setFrameworkVersion(e.target.value)}
                  placeholder="Enter framework version"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="library">Library</Label>
                <Input 
                  id="library" 
                  value={library}
                  onChange={(e) => setLibrary(e.target.value)}
                  placeholder="Enter library name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="libraryVersion">Library Version</Label>
                <Input 
                  id="libraryVersion" 
                  value={libraryVersion}
                  onChange={(e) => setLibraryVersion(e.target.value)}
                  placeholder="Enter library version"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={saveAiProcessingSettings}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Settings"}
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
              <span>Already Processed: {processedUrls.length}</span>
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