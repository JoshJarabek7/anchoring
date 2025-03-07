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
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base</CardTitle>
          <CardDescription>
            Search documentation and processed websites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Please set your OpenAI API key in Settings to use the Knowledge Base features.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base</CardTitle>
          <CardDescription>
            Search through processed content and documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="space-y-4">
            <TabsList className="grid grid-cols-2 w-[400px]">
              <TabsTrigger value="vectorSearch">Vector Search</TabsTrigger>
              <TabsTrigger value="docsLibrary">Docs Library</TabsTrigger>
            </TabsList>
            
            {/* Vector Search Tab */}
            <TabsContent value="vectorSearch" className="space-y-4">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for concepts, code examples, or solutions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVectorSearch();
                    }}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleVectorSearch}
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
                
                <div className="flex items-center text-xs text-muted-foreground">
                  <Badge variant="outline" className="mr-2">Global</Badge>
                  Searching across all processed content
                </div>
              </div>
              
              <div className="space-y-4">
                {searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <Card key={result.id} className="overflow-hidden">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-base">{result.snippet.title}</CardTitle>
                          <Badge variant="outline">
                            Score: {(result.score * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          Source: {result.snippet.source}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2">
                        <pre className="text-sm bg-muted p-2 rounded overflow-auto max-h-[300px]">
                          {result.snippet.content}
                        </pre>
                      </CardContent>
                    </Card>
                  ))
                ) : isSearching ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                    <p className="mt-2">Searching...</p>
                  </div>
                ) : null}
              </div>
            </TabsContent>
            
            {/* Docs Library Tab */}
            <TabsContent value="docsLibrary" className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="language">Language</SelectItem>
                    <SelectItem value="framework">Framework</SelectItem>
                    <SelectItem value="library">Library</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select 
                  value={selectedComponent} 
                  onValueChange={setSelectedComponent}
                  disabled={isLoadingComponents || availableComponents.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      isLoadingComponents 
                        ? "Loading..." 
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
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Search in docs..."
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleDocSearch();
                    }}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleDocSearch}
                    disabled={isDocSearching || (!docSearchQuery.trim() && !selectedComponent)}
                    className="shrink-0"
                  >
                    {isDocSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4">
                {docSearchResults.length > 0 ? (
                  docSearchResults.map((result) => (
                    <Card key={result.id} className="overflow-hidden">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-base">{result.snippet.title}</CardTitle>
                          <div className="flex gap-2">
                            <Badge>{result.snippet.name} {result.snippet.version || ""}</Badge>
                            <Badge variant="outline">
                              Score: {(result.score * 100).toFixed(1)}%
                            </Badge>
                          </div>
                        </div>
                        <CardDescription className="text-xs">
                          Category: {result.snippet.category}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2">
                        <pre className="text-sm bg-muted p-2 rounded overflow-auto max-h-[300px]">
                          {result.snippet.content}
                        </pre>
                      </CardContent>
                    </Card>
                  ))
                ) : isDocSearching ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                    <p className="mt-2">Searching...</p>
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