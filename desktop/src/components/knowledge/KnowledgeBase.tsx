import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, BookOpen, Code, Library, Info, Database } from "lucide-react";
import { ChromaClient } from "@/lib/chroma-client";
import { DocumentationCategory } from "@/lib/db";
import { getUserSettings } from "@/lib/db";

interface DocSnippet {
  id: string;
  title: string;
  content: string;
  source: string;
  category: "language" | "framework" | "library";
  name: string;
  version?: string;
}

interface SearchResult {
  id: string;
  score: number;
  snippet: DocSnippet;
}

interface KnowledgeBaseProps {
  apiKey: string;
}

export default function KnowledgeBase({ apiKey: propApiKey }: KnowledgeBaseProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<"vectorSearch" | "docsLibrary">("vectorSearch");
  
  // State to store the effective API key
  const [effectiveApiKey, setEffectiveApiKey] = useState<string>(propApiKey || "");
  
  // For the docs library
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedComponent, setSelectedComponent] = useState<string | undefined>();
  const [selectedVersion, setSelectedVersion] = useState<string | undefined>();
  const [availableComponents, setAvailableComponents] = useState<{name: string, version: string}[]>([]);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docSearchResults, setDocSearchResults] = useState<SearchResult[]>([]);
  const [isDocSearching, setIsDocSearching] = useState(false);
  const [docPage, setDocPage] = useState(1);
  const [hasMoreDocs, setHasMoreDocs] = useState(false);
  const [loadingMoreDocs, setLoadingMoreDocs] = useState(false);
  const docsPerPage = 20; // Number of docs to load per page
  
  // Load API key from multiple sources if needed
  useEffect(() => {
    const loadApiKey = async () => {
      // Start with the prop API key
      let key = propApiKey;
      
      // If no key from props, try to get it from the database
      if (!key || key.trim() === "") {
        try {
          console.log("No API key provided via props, trying to load from database...");
          const settings = await getUserSettings();
          if (settings?.openai_key) {
            console.log(`Found API key in database (length: ${settings.openai_key.length})`);
            key = settings.openai_key;
          }
        } catch (error) {
          console.error("Error loading API key from database:", error);
        }
      }
      
      // Check if we have a key from any source
      if (key && key.trim() !== "") {
        console.log(`Using API key (length: ${key.length})`);
        setEffectiveApiKey(key);
      } else {
        console.error("No API key available from any source!");
        toast.error("No OpenAI API key available. Please set it in the settings.");
      }
    };
    
    loadApiKey();
  }, [propApiKey]);
  
  // Debug effect - runs once when the component loads
  useEffect(() => {
    const runDebugDiagnostics = async () => {
      if (!effectiveApiKey) {
        console.log("No API key available for debugging");
        return;
      }
      
      try {
        console.log("Running diagnostic ChromaDB check...");
        const chromaClient = new ChromaClient(effectiveApiKey);
        await chromaClient.initialize();
        
        // Run our debug inspection
        await chromaClient.debugInspectCollection(20);
        
        // Try getting components for each category
        console.log("Trying to get language components...");
        await chromaClient.getAvailableComponents(DocumentationCategory.LANGUAGE);
        
        console.log("Trying to get framework components...");
        await chromaClient.getAvailableComponents(DocumentationCategory.FRAMEWORK);
        
        console.log("Trying to get library components...");
        await chromaClient.getAvailableComponents(DocumentationCategory.LIBRARY);
      } catch (err) {
        console.error("Error during diagnostics:", err);
      }
    };
    
    if (effectiveApiKey) {
      runDebugDiagnostics();
    }
  }, [effectiveApiKey]);

  // Vector search
  const handleVectorSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }
    
    if (!effectiveApiKey) {
      toast.error("OpenAI API key is required for search");
      return;
    }
    
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      console.log(`Starting vector search with API key (length: ${effectiveApiKey.length})`);
      
      // Import the search function
      const { vectorSearch } = await import("@/lib/knowledge");
      
      // Search across all content (not filtered by session)
      const results = await vectorSearch(searchQuery, effectiveApiKey);
      
      // Log the scores to debug
      if (results.length > 0) {
        console.log("Search results received with scores:", 
          results.map(r => ({ id: r.id, score: r.score })));
      }
      
      setSearchResults(results);
      
      if (results.length === 0) {
        toast.info("No results found. Try a different query.");
      }
    } catch (error) {
      console.error("Error during vector search:", error);
      toast.error(`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Effect to update available versions when component changes
  useEffect(() => {
    if (selectedComponent) {
      // Find versions for the selected component
      const component = availableComponents.find(c => c.name === selectedComponent);
      if (component?.version) {
        setAvailableVersions([component.version]);
        setSelectedVersion(component.version);
      } else {
        setAvailableVersions([]);
        setSelectedVersion(undefined);
      }
    } else {
      setAvailableVersions([]);
      setSelectedVersion(undefined);
    }
  }, [selectedComponent, availableComponents]);

  // Doc snippets search
  const handleDocSearch = async (loadMore: boolean = false) => {
    if (!loadMore && !docSearchQuery.trim() && !selectedComponent) {
      toast.error("Please enter a search query or select a component");
      return;
    }
    
    if (selectedComponent && !selectedVersion) {
      toast.error("Please select a version for the selected component");
      return;
    }
    
    if (!effectiveApiKey) {
      toast.error("OpenAI API key is required for search");
      return;
    }
    
    if (loadMore) {
      setLoadingMoreDocs(true);
    } else {
      setIsDocSearching(true);
      setDocSearchResults([]);
      setDocPage(1);
    }
    
    try {
      console.log(`${loadMore ? "Loading more docs" : "Starting doc search"} with API key (length: ${effectiveApiKey.length})`);
      
      // Import the doc search function
      const { searchDocSnippets } = await import("@/lib/knowledge");
      
      const currentPage = loadMore ? docPage + 1 : 1;
      const limit = docsPerPage;
      
      const results = await searchDocSnippets({
        query: docSearchQuery,
        category: selectedCategory as "language" | "framework" | "library" | undefined,
        componentName: selectedComponent,
        componentVersion: selectedVersion,
        apiKey: effectiveApiKey,
        limit,
        page: currentPage
      });
      
      if (loadMore) {
        // Append results to existing ones
        setDocSearchResults(prev => [...prev, ...results]);
      } else {
        setDocSearchResults(results);
      }
      
      // Update pagination state
      setDocPage(currentPage);
      
      // Always assume there might be more results unless we get fewer than the limit
      setHasMoreDocs(results.length >= limit);
      
      if (results.length === 0 && !loadMore) {
        toast.info("No documentation snippets found. Try a different query or selection.");
      } else if (results.length === 0 && loadMore) {
        toast.info("No more documentation snippets to load.");
        setHasMoreDocs(false);
      } else {
        console.log(`Retrieved ${results.length} snippets, page ${currentPage}. Total shown: ${(loadMore ? docSearchResults.length + results.length : results.length)}`);
      }
    } catch (error) {
      console.error("Error searching documentation snippets:", error);
      toast.error(`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      if (loadMore) {
        setLoadingMoreDocs(false);
      } else {
        setIsDocSearching(false);
      }
    }
  };

  // Load components for the selected category
  useEffect(() => {
    if (!selectedCategory) {
      setAvailableComponents([]);
      setSelectedComponent(undefined);
      setSelectedVersion(undefined);
      return;
    }
    
    const loadComponents = async () => {
      setIsLoadingComponents(true);
      try {
        // Import the list components function
        const { listDocComponents } = await import("@/lib/knowledge");
        
        const components = await listDocComponents(selectedCategory as "language" | "framework" | "library", effectiveApiKey);
        setAvailableComponents(components);
        
        // Reset selections
        setSelectedComponent(undefined);
        setSelectedVersion(undefined);
      } catch (error) {
        console.error("Error loading components:", error);
        toast.error("Failed to load components for selected category");
        setAvailableComponents([]);
      } finally {
        setIsLoadingComponents(false);
      }
    };
    
    loadComponents();
  }, [selectedCategory, effectiveApiKey]);

  // Check if we have the API key
  if (!effectiveApiKey) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-xl font-semibold">
            <BookOpen className="h-5 w-5 mr-2 text-primary" />
            Knowledge Base
          </CardTitle>
          <CardDescription>
            Search documentation and processed websites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertDescription className="flex items-center">
              Please set your OpenAI API key in Settings to use the Knowledge Base features.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-xl font-semibold">
            <BookOpen className="h-5 w-5 mr-2 text-primary" />
            Knowledge Base
          </CardTitle>
          <CardDescription>
            Search through processed content and documentation
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="space-y-6">
            <div className="w-full flex justify-center">
              <TabsList className="inline-flex h-12 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-full max-w-[450px] shadow-sm">
                <TabsTrigger 
                  value="vectorSearch" 
                  className="inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm w-full rounded-md"
                >
                  <div className="flex items-center">
                    <div className={`p-1.5 rounded-full mr-2 ${activeTab === "vectorSearch" ? "bg-primary/10" : ""}`}>
                      <Search className={`h-4 w-4 ${activeTab === "vectorSearch" ? "text-primary" : ""}`} />
                    </div>
                    <span className="truncate">Vector Search</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger 
                  value="docsLibrary" 
                  className="inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm w-full rounded-md"
                >
                  <div className="flex items-center">
                    <div className={`p-1.5 rounded-full mr-2 ${activeTab === "docsLibrary" ? "bg-primary/10" : ""}`}>
                      <BookOpen className={`h-4 w-4 ${activeTab === "docsLibrary" ? "text-primary" : ""}`} />
                    </div>
                    <span className="truncate">Docs Library</span>
                  </div>
                </TabsTrigger>
              </TabsList>
            </div>
            
            {/* Vector Search Tab */}
            <TabsContent value="vectorSearch" className="space-y-6">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search for concepts, code examples, or solutions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleVectorSearch();
                      }}
                      className="pl-9 h-11 shadow-sm border-muted focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full"
                        aria-label="Clear search"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                  <Button 
                    onClick={handleVectorSearch}
                    disabled={isSearching || !searchQuery.trim()}
                    className="shrink-0 h-11 px-5 shadow-sm"
                  >
                    {isSearching ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                        <span>Searching...</span>
                      </>
                    ) : (
                      <span>Search</span>
                    )}
                  </Button>
                </div>
                
                <div className="flex items-center text-xs text-muted-foreground">
                  <Badge variant="secondary" className="mr-2">Global</Badge>
                  Searching across all processed content using semantic search
                </div>
              </div>
              
              <div>
                {searchResults.length > 0 ? (
                  <ScrollArea className="h-[650px] pr-4">
                    <div className="space-y-4">
                      {searchResults.map((result) => (
                        <Card 
                          key={result.id} 
                          className="overflow-hidden border-l-4 border-l-primary shadow-sm transition-all hover:shadow-md hover:scale-[1.01]"
                        >
                          <CardHeader className="p-4 pb-2 bg-gradient-to-r from-background to-background/95">
                            <div className="flex justify-between items-start gap-2">
                              <CardTitle className="text-base font-medium line-clamp-2">{result.snippet.title}</CardTitle>
                              <Badge variant="outline" className="shrink-0 bg-background/80">
                                {typeof result.score === 'number' ? 
                                  `${(result.score * 100).toFixed(1)}%` : 
                                  'Score N/A'}
                              </Badge>
                            </div>
                            <CardDescription className="flex items-center gap-2 text-xs mt-1 truncate">
                              <Info className="h-3 w-3 opacity-70" />
                              <span className="truncate">{result.snippet.source}</span>
                              {result.snippet.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {result.snippet.category}
                                </Badge>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 pt-2 max-h-72 overflow-y-auto">
                            <pre className="text-sm bg-muted/50 p-3 rounded-md overflow-x-auto border whitespace-pre-wrap break-all">
                              {result.snippet.content}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : isSearching ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-12 w-12 border-3 border-primary border-t-transparent"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Search className="h-5 w-5 text-primary/60" />
                      </div>
                    </div>
                    <p className="text-muted-foreground font-medium">Searching knowledge base...</p>
                    <p className="text-xs text-muted-foreground/70">Finding the most relevant results for you</p>
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
                    <div className="bg-muted/30 rounded-full p-4 mb-5">
                      <Search className="h-12 w-12 text-muted-foreground/60" />
                    </div>
                    <p className="text-lg font-medium text-muted-foreground">No results found for "{searchQuery}"</p>
                    <p className="text-sm text-muted-foreground/70 mt-2 mb-4">Try adjusting your search terms or explore the suggestions below</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      <Button variant="outline" size="sm" onClick={() => setSearchQuery("documentation examples")}>
                        Documentation Examples
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSearchQuery("code snippets")}>
                        Code Snippets
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab("docsLibrary")}>
                        Browse Docs Library
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
                    <div className="bg-muted/30 rounded-full p-4 mb-5">
                      <Search className="h-12 w-12 text-primary/50" />
                    </div>
                    <p className="text-lg font-medium text-foreground mb-2">Knowledge Base Search</p>
                    <p className="text-sm text-muted-foreground mb-6">Search across all processed documentation and code snippets</p>
                    <div className="w-full max-w-sm">
                      <div className="bg-muted/30 rounded-lg p-4">
                        <p className="text-sm font-medium text-muted-foreground mb-3">Try searching for:</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                          <Button variant="secondary" size="sm" onClick={() => setSearchQuery("react hooks examples")}>
                            React Hooks
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setSearchQuery("api authentication")}>
                            API Auth
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setSearchQuery("css grid layout")}>
                            CSS Grid
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            
            {/* Docs Library Tab */}
            <TabsContent value="docsLibrary" className="space-y-6">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Code className="h-4 w-4 text-muted-foreground" />
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="language">Language</SelectItem>
                        <SelectItem value="framework">Framework</SelectItem>
                        <SelectItem value="library">Library</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Library className="h-4 w-4 text-muted-foreground" />
                    <Select 
                      value={selectedComponent} 
                      onValueChange={setSelectedComponent}
                      disabled={isLoadingComponents || availableComponents.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={
                          isLoadingComponents 
                            ? "Loading components..." 
                            : availableComponents.length === 0
                            ? "No components available"
                            : "Select component"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {availableComponents.length > 0 ? (
                          availableComponents.map((component) => (
                            <SelectItem key={component.name} value={component.name}>
                              {component.name}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-4 text-center">
                            <div className="text-sm text-muted-foreground">No {selectedCategory}s available</div>
                            <div className="text-xs text-muted-foreground/70 mt-1">Try crawling documentation first</div>
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {selectedComponent && (
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <Select 
                        value={selectedVersion} 
                        onValueChange={setSelectedVersion}
                        disabled={availableVersions.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select version" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableVersions.length > 0 ? (
                            availableVersions.map((version) => (
                              <SelectItem key={version} value={version}>
                                {version}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="px-2 py-4 text-center">
                              <div className="text-sm text-muted-foreground">No versions available</div>
                              <div className="text-xs text-muted-foreground/70 mt-1">Try selecting a different component</div>
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search in docs..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleDocSearch();
                      }}
                      className="pl-9 w-full h-11 shadow-sm border-muted focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                    />
                    {docSearchQuery && (
                      <button
                        onClick={() => setDocSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full"
                        aria-label="Clear search"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                  <Button 
                    onClick={() => handleDocSearch(true)}
                    disabled={
                      isDocSearching || 
                      // Enable if we have a component selected, even without a query
                      (!docSearchQuery.trim() && !selectedComponent) ||
                      // But require a version if component is selected
                      (!!selectedComponent && !selectedVersion)
                    }
                    className="shrink-0 h-11 px-5 shadow-sm"
                  >
                    {isDocSearching ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                        <span>Searching...</span>
                      </>
                    ) : docSearchQuery.trim() ? (
                      <span>Search</span>
                    ) : (
                      <>
                        <BookOpen className="h-4 w-4 mr-2" />
                        <span>Browse Docs</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              <div>
                {docSearchResults.length > 0 ? (
                  <ScrollArea className="h-[650px] pr-4">
                    <div className="space-y-4">
                      {docSearchResults.map((result) => (
                        <Card 
                          key={result.id} 
                          className="overflow-hidden border-l-4 border-l-primary shadow-sm transition-all hover:shadow-md hover:scale-[1.01]"
                        >
                          <CardHeader className="p-4 pb-2 bg-gradient-to-r from-background to-background/95">
                            <div className="flex flex-wrap justify-between items-start gap-2">
                              <CardTitle className="text-base font-medium line-clamp-2">{result.snippet.title}</CardTitle>
                              <div className="flex flex-wrap gap-2">
                                <Badge className="shrink-0 bg-secondary/10">
                                  {result.snippet.name} {result.snippet.version || ""}
                                </Badge>
                                <Badge variant="outline" className="shrink-0 bg-background/80">
                                  {typeof result.score === 'number' ? 
                                    `${(result.score * 100).toFixed(1)}%` : 
                                    'Score N/A'}
                                </Badge>
                              </div>
                            </div>
                            <CardDescription className="flex items-center text-xs mt-1 truncate">
                              <Info className="h-3 w-3 mr-1 opacity-70" />
                              Category: {result.snippet.category}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 pt-2 max-h-72 overflow-y-auto">
                            <pre className="text-sm bg-muted/50 p-3 rounded-md overflow-x-auto border whitespace-pre-wrap break-all">
                              {result.snippet.content}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                      
                      {/* Load More Button */}
                      {hasMoreDocs && (
                        <div className="flex justify-center mt-4">
                          <Button
                            variant="outline"
                            onClick={() => handleDocSearch(true)}
                            disabled={loadingMoreDocs}
                            className="w-full max-w-[300px] bg-background hover:bg-muted/50 transition-all"
                          >
                            {loadingMoreDocs ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent mr-2"></div>
                                <span>Loading more results...</span>
                              </>
                            ) : (
                              <>
                                <Database className="h-4 w-4 mr-2" />
                                <span>Load More Documents</span>
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : isDocSearching ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-12 w-12 border-3 border-primary border-t-transparent"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-primary/60" />
                      </div>
                    </div>
                    <p className="text-muted-foreground font-medium">Searching documentation...</p>
                    <p className="text-xs text-muted-foreground/70">Looking through the documentation library</p>
                  </div>
                ) : selectedCategory && availableComponents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
                    <div className="bg-amber-100/30 dark:bg-amber-900/20 rounded-full p-4 mb-5">
                      <Database className="h-12 w-12 text-amber-600 dark:text-amber-400" />
                    </div>
                    <p className="text-lg font-medium text-foreground">No {selectedCategory}s available</p>
                    <p className="text-sm text-muted-foreground mt-2 mb-4">
                      Your knowledge base doesn't have any {selectedCategory} documentation yet
                    </p>
                    <Button variant="outline" size="sm" className="border-amber-200 dark:border-amber-800">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Crawl {selectedCategory} documentation
                    </Button>
                  </div>
                ) : docSearchQuery.trim() || selectedComponent ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
                    <div className="bg-muted/30 rounded-full p-4 mb-5">
                      <Search className="h-12 w-12 text-muted-foreground/60" />
                    </div>
                    <p className="text-lg font-medium text-muted-foreground">No documentation snippets found</p>
                    <p className="text-sm text-muted-foreground/70 mt-2 mb-4">Try a different search term or select another component</p>
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => setDocSearchQuery("")}>
                        Clear Search
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedCategory(undefined)}>
                        Reset Filters
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}