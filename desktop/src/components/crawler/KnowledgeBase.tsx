import React, { useState, useEffect } from 'react';
import { useKnowledgeBase, KnowledgeBaseFilters } from '@/hooks/useKnowledgeBase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DocumentationSnippetCard from './DocumentationSnippet';
import { Search, FilterX, ExternalLink } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { DocumentationCategory } from '@/lib/db';

interface KnowledgeBaseProps {
  apiKey: string;
}

export default function KnowledgeBase({ apiKey }: KnowledgeBaseProps) {
  const [searchInput, setSearchInput] = useState('');
  const [openSourceUrl, setOpenSourceUrl] = useState<string | null>(null);
  const {
    searchQuery,
    searchResults,
    filters,
    loading,
    error,
    availableComponents,
    searchSnippets,
    updateFilters,
    clearSearch,
    loadAvailableComponents
  } = useKnowledgeBase(apiKey);

  // Execute search on enter key or submit
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchInput.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    await searchSnippets(searchInput);
  };

  // Reset all filters
  const resetFilters = () => {
    updateFilters({
      category: 'all',
      language: undefined,
      language_version: undefined,
      framework: undefined,
      framework_version: undefined,
      library: undefined,
      library_version: undefined
    });
    
    // If there's an active search, rerun it with the cleared filters
    if (searchQuery) {
      searchSnippets(searchQuery);
    }
  };

  // View source in a new tab
  const handleViewSource = (url: string) => {
    if (!url) return;
    
    // For Tauri app, we'll use the window.open or an API to open external links
    setOpenSourceUrl(url);
    window.open(url, '_blank');
  };

  // If error occurs, show a toast
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Render category-specific filters based on selected category
  const renderCategoryFilters = () => {
    switch (filters.category) {
      case DocumentationCategory.LANGUAGE:
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="language">Language</Label>
              <Select
                value={filters.language || ''}
                onValueChange={(value) => {
                  updateFilters({ language: value });
                  if (searchQuery) searchSnippets(searchQuery, { ...filters, language: value });
                }}
              >
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any Language</SelectItem>
                  {availableComponents.languages.map((lang) => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="language_version">Version</Label>
              <Input
                id="language_version"
                value={filters.language_version || ''}
                onChange={(e) => {
                  updateFilters({ language_version: e.target.value });
                  if (searchQuery) searchSnippets(searchQuery, { ...filters, language_version: e.target.value });
                }}
                placeholder="e.g. ES2020, Python 3.9"
              />
            </div>
          </div>
        );
      
      case DocumentationCategory.FRAMEWORK:
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="framework">Framework</Label>
              <Select
                value={filters.framework || ''}
                onValueChange={(value) => {
                  updateFilters({ framework: value });
                  if (searchQuery) searchSnippets(searchQuery, { ...filters, framework: value });
                }}
              >
                <SelectTrigger id="framework">
                  <SelectValue placeholder="Select framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any Framework</SelectItem>
                  {availableComponents.frameworks.map((fw) => (
                    <SelectItem key={fw} value={fw}>{fw}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="framework_version">Version</Label>
              <Input
                id="framework_version"
                value={filters.framework_version || ''}
                onChange={(e) => {
                  updateFilters({ framework_version: e.target.value });
                  if (searchQuery) searchSnippets(searchQuery, { ...filters, framework_version: e.target.value });
                }}
                placeholder="e.g. 2.3.1, 18.2.0"
              />
            </div>
          </div>
        );
      
      case DocumentationCategory.LIBRARY:
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="library">Library</Label>
              <Select
                value={filters.library || ''}
                onValueChange={(value) => {
                  updateFilters({ library: value });
                  if (searchQuery) searchSnippets(searchQuery, { ...filters, library: value });
                }}
              >
                <SelectTrigger id="library">
                  <SelectValue placeholder="Select library" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any Library</SelectItem>
                  {availableComponents.libraries.map((lib) => (
                    <SelectItem key={lib} value={lib}>{lib}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="library_version">Version</Label>
              <Input
                id="library_version"
                value={filters.library_version || ''}
                onChange={(e) => {
                  updateFilters({ library_version: e.target.value });
                  if (searchQuery) searchSnippets(searchQuery, { ...filters, library_version: e.target.value });
                }}
                placeholder="e.g. 1.0.0, 4.2.1"
              />
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Knowledge Base</CardTitle>
        <CardDescription>
          Search your documentation snippets using semantic search
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Search form */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex space-x-2">
            <div className="flex-1">
              <Input
                placeholder="Search documentation snippets..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
          
          {/* Filter section */}
          <div className="border rounded-md p-4 space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-base font-medium">Filters</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={resetFilters}
                className="h-8 px-2 text-xs"
              >
                <FilterX className="h-3 w-3 mr-1" />
                Reset Filters
              </Button>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={filters.category}
                  onValueChange={(value: DocumentationCategory | 'all') => {
                    updateFilters({ category: value });
                    if (searchQuery) searchSnippets(searchQuery, { ...filters, category: value });
                  }}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value={DocumentationCategory.LANGUAGE}>Language</SelectItem>
                    <SelectItem value={DocumentationCategory.FRAMEWORK}>Framework</SelectItem>
                    <SelectItem value={DocumentationCategory.LIBRARY}>Library</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Render category-specific filters */}
              {filters.category !== 'all' && renderCategoryFilters()}
            </div>
          </div>
        </form>
        
        {/* Search results */}
        <div className="min-h-[300px]">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-[160px] w-full" />
              <Skeleton className="h-[160px] w-full" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1">
              <h3 className="text-sm font-medium mb-2">
                Found {searchResults.length} results for "{searchQuery}"
              </h3>
              
              <ScrollArea className="h-[500px]">
                <div className="space-y-2 pr-4">
                  {searchResults.map((snippet) => (
                    <DocumentationSnippetCard 
                      key={snippet.snippet_id} 
                      snippet={snippet} 
                      onViewSource={handleViewSource}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : searchQuery ? (
            <div className="text-center py-10 text-muted-foreground">
              No results found for "{searchQuery}"
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              Enter a search query to find documentation snippets
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 