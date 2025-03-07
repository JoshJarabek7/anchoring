import { useState, useEffect } from "react";
import { toast } from "@/components/ui/sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, BookOpen, Code, Library, Info } from "lucide-react";

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

export default function KnowledgeBase({ apiKey }: KnowledgeBaseProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<"vectorSearch" | "docsLibrary">("vectorSearch");
  
  // For the docs library
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedComponent, setSelectedComponent] = useState<string | undefined>();
  const [selectedVersion, setSelectedVersion] = useState<string | undefined>();
  const [availableComponents, setAvailableComponents] = useState<{name: string, version?: string}[]>([]);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docSearchResults, setDocSearchResults] = useState<SearchResult[]>([]);
  const [isDocSearching, setIsDocSearching] = useState(false);

  // Vector search
  const handleVectorSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }
    
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      // Import the search function
      const { vectorSearch } = await import("@/lib/knowledge");
      
      // Search across all content (not filtered by session)
      const results = await vectorSearch(searchQuery);
      setSearchResults(results);
      
      if (results.length === 0) {
        toast.info("No results found. Try a different query.");
      }
    } catch (error) {
      console.error("Error during vector search:", error);
      toast.error("An error occurred during search. Check console for details.");
    } finally {
      setIsSearching(false);
    }
  };

  // Doc snippets search
  const handleDocSearch = async () => {
    if (!docSearchQuery.trim() && !selectedComponent) {
      toast.error("Please enter a search query or select a component");
      return;
    }
    
    setIsDocSearching(true);
    setDocSearchResults([]);
    
    try {
      // Import the doc search function
      const { searchDocSnippets } = await import("@/lib/knowledge");
      
      const results = await searchDocSnippets({
        query: docSearchQuery,
        category: selectedCategory as "language" | "framework" | "library" | undefined,
        componentName: selectedComponent,
        componentVersion: selectedVersion
      });
      
      setDocSearchResults(results);
      
      if (results.length === 0) {
        toast.info("No documentation snippets found. Try a different query or selection.");
      }
    } catch (error) {
      console.error("Error searching documentation snippets:", error);
      toast.error("Failed to search documentation snippets");
    } finally {
      setIsDocSearching(false);
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
        
        const components = await listDocComponents(selectedCategory as "language" | "framework" | "library");
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
  }, [selectedCategory]);

  // Check if we have the API key
  if (!apiKey) {
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
              <TabsList className="inline-flex h-11 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-full sm:w-[400px]">
                <TabsTrigger value="vectorSearch" className="inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm w-full">
                  <Search className="h-4 w-4 mr-2" />
                  <span className="truncate">Vector Search</span>
                </TabsTrigger>
                <TabsTrigger value="docsLibrary" className="inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm w-full">
                  <BookOpen className="h-4 w-4 mr-2" />
                  <span className="truncate">Docs Library</span>
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
                      className="pl-9"
                    />
                  </div>
                  <Button 
                    onClick={handleVectorSearch}
                    disabled={isSearching || !searchQuery.trim()}
                    className="shrink-0"
                  >
                    {isSearching ? "Searching..." : "Search"}
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
                        <Card key={result.id} className="overflow-hidden border-muted shadow-sm transition-all hover:shadow-md">
                          <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start gap-2">
                              <CardTitle className="text-base font-medium">{result.snippet.title}</CardTitle>
                              <Badge variant="outline" className="shrink-0">
                                {(result.score * 100).toFixed(1)}%
                              </Badge>
                            </div>
                            <CardDescription className="flex items-center text-xs mt-1">
                              <Info className="h-3 w-3 mr-1 text-muted-foreground/70" />
                              {result.snippet.source}
                              {result.snippet.category && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {result.snippet.category}
                                </Badge>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 pt-2">
                            <pre className="text-sm bg-muted/50 p-3 rounded-md overflow-auto max-h-[300px] border">
                              {result.snippet.content}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : isSearching ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                    <p className="text-muted-foreground">Searching knowledge base...</p>
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Try a different search term or browse the docs library</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">Enter a search query to find documentation snippets</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Search across all processed documentation</p>
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
                        {availableComponents.map((component) => (
                          <SelectItem key={component.name} value={component.name}>
                            {component.name} {component.version ? `(${component.version})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                      className="pl-9 w-full"
                    />
                  </div>
                  <Button 
                    onClick={handleDocSearch}
                    disabled={isDocSearching || (!docSearchQuery.trim() && !selectedComponent)}
                    className="shrink-0"
                  >
                    {isDocSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>
              
              <div>
                {docSearchResults.length > 0 ? (
                  <ScrollArea className="h-[650px] pr-4">
                    <div className="space-y-4">
                      {docSearchResults.map((result) => (
                        <Card key={result.id} className="overflow-hidden border-muted shadow-sm transition-all hover:shadow-md">
                          <CardHeader className="p-4 pb-2">
                            <div className="flex flex-wrap justify-between items-start gap-2">
                              <CardTitle className="text-base font-medium">{result.snippet.title}</CardTitle>
                              <div className="flex flex-wrap gap-2">
                                <Badge className="shrink-0">
                                  {result.snippet.name} {result.snippet.version || ""}
                                </Badge>
                                <Badge variant="outline" className="shrink-0">
                                  {(result.score * 100).toFixed(1)}%
                                </Badge>
                              </div>
                            </div>
                            <CardDescription className="flex items-center text-xs mt-1">
                              <Info className="h-3 w-3 mr-1 text-muted-foreground/70" />
                              Category: {result.snippet.category}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 pt-2">
                            <pre className="text-sm bg-muted/50 p-3 rounded-md overflow-auto max-h-[300px] border">
                              {result.snippet.content}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                ) : isDocSearching ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                    <p className="text-muted-foreground">Searching documentation...</p>
                  </div>
                ) : selectedCategory && !availableComponents.length && !isLoadingComponents ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Library className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No components found for this category</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Try selecting a different category</p>
                  </div>
                ) : !selectedCategory && !docSearchQuery ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">Select a category and component to browse documentation</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Or search directly across all documentation</p>
                  </div>
                ) : docSearchResults.length === 0 && (selectedComponent || docSearchQuery.trim()) ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No documentation snippets found</p>
                    <p className="text-xs text-muted-foreground/70 mt-2">Try a different search term or component</p>
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