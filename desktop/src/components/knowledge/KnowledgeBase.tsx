import { useState, useEffect, useRef } from "react";
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
import { useVectorDB } from '../../hooks/useVectorDB';

interface KnowledgeBaseProps {
  sessionId: number;
}

// Helper function to extract name from content if metadata is not available
function extractNameFromContent(content: string): string | undefined {
  // Try to find a title-like string in the first few lines
  const lines = content.split('\n').slice(0, 5);
  for (const line of lines) {
    // Look for common patterns like "# Name" or "Title: Name"
    const titleMatch = line.match(/^(?:#{1,3}\s+|Title:\s*)(.+?)(?:\s*#*\s*$)/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
  }
  return undefined;
}

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
  snippet: {
    title: string;
    content: string;
    source: string;
    category: "language" | "framework" | "library";
    name: string;
    version?: string;
  };
}

// Add a type definition for the vector DB document
interface VectorDBDocument {
  id: string;
  content: string;
  metadata: {
    title: string;
    source?: string;
    category?: string;
    name?: string;
    version?: string;
    url?: string;
    status?: string;
    [key: string]: any;
  };
  score?: number;
}

export default function KnowledgeBase({ sessionId }: KnowledgeBaseProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [selectedComponent, setSelectedComponent] = useState<string | undefined>(undefined);
  const [components, setComponents] = useState<{ category: string; name: string }[]>([]);
  const [docResults, setDocResults] = useState<DocSnippet[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreDocs, setHasMoreDocs] = useState(true);
  const [activeTab, setActiveTab] = useState("search");
  const componentMountedRef = useRef(true);
  const loadingComponentsRef = useRef(false);
  const hasLoadedComponentsRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { 
    vectorDB,
    searchDocuments, 
    getDocumentsByFilters,
    isInitialized,
    loading: vectorDBLoading,
    error: vectorDBError
  } = useVectorDB(sessionId);

  useEffect(() => {
    componentMountedRef.current = true;
    abortControllerRef.current = new AbortController();

    return () => {
      componentMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      loadingComponentsRef.current = false;
      hasLoadedComponentsRef.current = false;
    };
  }, []);

  useEffect(() => {
    setComponents([]);
    hasLoadedComponentsRef.current = false;
    loadingComponentsRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!componentMountedRef.current) return;

    const shouldLoadComponents = 
      vectorDB && 
      isInitialized && 
      !vectorDBLoading && 
      !loadingComponentsRef.current && 
      !hasLoadedComponentsRef.current;

    if (shouldLoadComponents) {
      loadComponents();
    }
  }, [sessionId, isInitialized, vectorDBLoading, vectorDBError, vectorDB]);

  const loadComponents = async () => {
    if (!componentMountedRef.current || loadingComponentsRef.current || hasLoadedComponentsRef.current) {
      return;
    }
    
    if (!vectorDB || !isInitialized) {
      console.error('Vector DB not initialized or unavailable');
      return;
    }

    try {
      loadingComponentsRef.current = true;
      
      const categories = ["language", "framework", "library"];
      const componentsList: { category: string; name: string }[] = [];
      
      for (const category of categories) {
        if (!componentMountedRef.current) return;
        
        const results = await getDocumentsByFilters({ category }, 100);

        if (!componentMountedRef.current) return;
        
        const uniqueComponents = new Set<string>();
        
        results.forEach((result: VectorDBDocument) => {
          const name = category === 'framework' ? result.metadata?.framework :
                      category === 'language' ? result.metadata?.language :
                      category === 'library' ? result.metadata?.library :
                      result.metadata?.name || extractNameFromContent(result.content);
          
          if (name) {
            const key = `${category}:${name}`;
            if (!uniqueComponents.has(key)) {
              uniqueComponents.add(key);
              componentsList.push({ category, name });
            }
          }
        });
      }
      
      if (componentMountedRef.current) {
        setComponents(componentsList);
        hasLoadedComponentsRef.current = true;
      }
    } catch (error) {
      console.error("Error loading components:", error);
      if (componentMountedRef.current) {
        toast.error("Failed to load components");
      }
    } finally {
      loadingComponentsRef.current = false;
    }
  };

  const handleVectorSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    if (!isInitialized) {
      toast.error("Vector database is not available");
      return;
    }

    try {
      setIsSearching(true);
      setSearchResults([]);

      const results = await searchDocuments(searchQuery, {
        category: selectedCategory || undefined,
        [selectedCategory || ""]: selectedComponent || undefined
      }, 10);

      const formattedResults = results.map((result: VectorDBDocument) => ({
        id: result.id,
        score: result.score || 0,
        snippet: {
          title: result.metadata?.title || extractNameFromContent(result.content) || 'Untitled',
          content: result.content || '',
          source: result.metadata?.source_url || '',
          category: selectedCategory as "language" | "framework" | "library" || result.metadata?.category || "library",
          name: result.metadata?.name || selectedComponent || extractNameFromContent(result.content) || '',
          version: result.metadata?.version
        }
      }));

      setSearchResults(formattedResults);
    } catch (error) {
      console.error("Error searching vector database:", error);
      toast.error("Error searching knowledge base");
    } finally {
      setIsSearching(false);
    }
  };

  const handleDocSearch = async (loadMore: boolean = false) => {
    if (!isInitialized) {
      toast.error("Vector database is not available");
      return;
    }

    try {
      setIsLoadingDocs(true);
      
      const page = loadMore ? currentPage + 1 : 1;
      const limit = 10;
      
      const filters: Record<string, any> = {};
      if (selectedCategory) {
        filters.category = selectedCategory;
        
        if (selectedComponent) {
          if (selectedCategory === 'framework') {
            filters.framework = selectedComponent;
          } else if (selectedCategory === 'language') {
            filters.language = selectedComponent;
          } else if (selectedCategory === 'library') {
            filters.library = selectedComponent;
          }
        }
      }
      
      const results = await getDocumentsByFilters(filters, limit);

      const formattedResults = results.map((result: VectorDBDocument) => {
        const name = selectedCategory === 'framework' ? result.metadata?.framework :
                    selectedCategory === 'language' ? result.metadata?.language :
                    selectedCategory === 'library' ? result.metadata?.library :
                    result.metadata?.name || selectedComponent || '';

        const version = selectedCategory === 'framework' ? result.metadata?.framework_version :
                       selectedCategory === 'language' ? result.metadata?.language_version :
                       selectedCategory === 'library' ? result.metadata?.library_version :
                       result.metadata?.version || '';

        return {
          id: result.id,
          title: result.metadata?.title || name || "Untitled",
          content: result.metadata?.content || result.content || '',
          source: result.metadata?.source_url || '',
          category: selectedCategory as "language" | "framework" | "library" || result.metadata?.category || "library",
          name: name,
          version: version
        };
      });

      if (loadMore) {
        setDocResults([...docResults, ...formattedResults]);
      } else {
        setDocResults(formattedResults);
      }

      setCurrentPage(page);
      setHasMoreDocs(formattedResults.length === limit);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Error loading documents");
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (selectedComponent && isInitialized) {
      handleDocSearch();
    }
  }, [selectedComponent]);

  return (
    <div className="flex flex-col h-full">
      {/* Show alert when vector DB is not initialized */}
      {(!isInitialized || vectorDBLoading) && (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="font-medium">
                {vectorDBLoading 
                  ? "Initializing vector database..." 
                  : sessionId <= 0
                    ? "No session selected"
                    : "Vector database not initialized"}
              </span>
            </div>
            {!vectorDBLoading && (
              <div className="text-sm text-muted-foreground">
                {sessionId <= 0 
                  ? "Please select a session to use the knowledge base." 
                  : "Please wait while the vector database initializes."}
              </div>
            )}
            {vectorDBError && (
              <div className="text-sm text-destructive">
                Error: {vectorDBError.message}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Show knowledge base content when vector DB is initialized */}
      {isInitialized && (
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
                        disabled={!isInitialized || components.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={
                            !isInitialized 
                              ? "Vector database not available" 
                              : components.length === 0
                              ? "No components available"
                              : "Select component"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {components.length > 0 ? (
                            components.map((component) => (
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
                  </div>
                  
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search in docs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleDocSearch();
                        }}
                        className="pl-9 w-full h-11 shadow-sm border-muted focus-visible:ring-primary/20 focus-visible:ring-offset-0"
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
                      onClick={() => handleDocSearch(true)}
                      disabled={
                        isLoadingDocs || 
                        // Enable if we have a component selected, even without a query
                        (!searchQuery.trim() && !selectedComponent) ||
                        // But require a version if component is selected
                        (!!selectedComponent && !components.find(c => c.name === selectedComponent))
                      }
                      className="shrink-0 h-11 px-5 shadow-sm"
                    >
                      {isLoadingDocs ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                          <span>Searching...</span>
                        </>
                      ) : searchQuery.trim() ? (
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
                  {docResults.length > 0 ? (
                    <ScrollArea className="h-[650px] pr-4">
                      <div className="space-y-4">
                        {docResults.map((result) => (
                          <Card 
                            key={result.id} 
                            className="overflow-hidden border-l-4 border-l-primary shadow-sm transition-all hover:shadow-md hover:scale-[1.01]"
                          >
                            <CardHeader className="p-4 pb-2 bg-gradient-to-r from-background to-background/95">
                              <div className="flex flex-wrap justify-between items-start gap-2">
                                <CardTitle className="text-base font-medium line-clamp-2">{result.title}</CardTitle>
                                <div className="flex flex-wrap gap-2">
                                  <Badge className="shrink-0 bg-secondary/10">
                                    {result.name} {result.version || ""}
                                  </Badge>
                                </div>
                              </div>
                              <CardDescription className="flex items-center text-xs mt-1 truncate">
                                <Info className="h-3 w-3 mr-1 opacity-70" />
                                Category: {result.category}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-2 max-h-72 overflow-y-auto">
                              <pre className="text-sm bg-muted/50 p-3 rounded-md overflow-x-auto border whitespace-pre-wrap break-all">
                                {result.content}
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
                              disabled={isLoadingDocs}
                              className="w-full max-w-[300px] bg-background hover:bg-muted/50 transition-all"
                            >
                              {isLoadingDocs ? (
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
                  ) : isLoadingDocs ? (
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
                  ) : selectedCategory && components.length === 0 ? (
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
                  ) : searchQuery.trim() || selectedComponent ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
                      <div className="bg-muted/30 rounded-full p-4 mb-5">
                        <Search className="h-12 w-12 text-muted-foreground/60" />
                      </div>
                      <p className="text-lg font-medium text-muted-foreground">No documentation snippets found</p>
                      <p className="text-sm text-muted-foreground/70 mt-2 mb-4">Try a different search term or select another component</p>
                      <div className="flex gap-3">
                        <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
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
      )}
    </div>
  );
}