import { ConceptBadge } from "@/components/knowledge-reef/concept-badge";
import { SearchResultCard } from "@/components/knowledge-reef/search-result-card";
import { SnippetCard } from "@/components/knowledge-reef/snippet-card";
import { SnippetViewer } from "@/components/knowledge-reef/snippet-viewer";
import { Button } from "@/components/ui/button";
import { GlassContainer } from "@/components/ui/glass-container";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DocumentationSnippet,
  SearchResult,
  useSnippetStore,
} from "@/stores/snippet-store";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUIStore } from "@/stores/ui-store";
import { AnimatePresence, motion } from "framer-motion";
import {
  Code,
  Filter,
  Globe,
  Info,
  Layers,
  Search,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";

// Component for animated lightning with sparks
const AnimatedLightning = ({ isClicked }: { isClicked: boolean }) => {
  return (
    <motion.div className="relative">
      {/* Enhanced background flash effect */}
      <AnimatePresence>
        {isClicked && (
          <motion.div
            className="absolute inset-0 rounded-full bg-yellow-200/30"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.5, 2] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>

      {/* Lightning bolt with enhanced glow */}
      <motion.div
        className="relative z-10"
        animate={{
          color: isClicked ? ["#facc15", "#fef08a", "#facc15"] : "#facc15",
          filter: isClicked
            ? [
                "drop-shadow(0 0 3px rgba(250, 204, 21, 0.6))",
                "drop-shadow(0 0 8px rgba(254, 240, 138, 0.9))",
                "drop-shadow(0 0 3px rgba(250, 204, 21, 0.6))",
              ]
            : "drop-shadow(0 0 3px rgba(250, 204, 21, 0.6))",
        }}
        transition={{
          duration: isClicked ? 0.5 : 0.3,
          repeat: isClicked ? 3 : 0,
          repeatType: "reverse",
        }}
        whileHover={{
          scale: 1.2,
          rotate: [-2, 2, -2],
          filter: "drop-shadow(0 0 5px rgba(254, 240, 138, 0.8))",
          transition: { duration: 0.5, repeat: Infinity },
        }}
      >
        <Zap className="h-5 w-5" />
      </motion.div>

      {/* Enhanced spark particles */}
      <AnimatePresence>
        {isClicked && (
          <>
            {/* Main larger sparks */}
            {Array(8)
              .fill(0)
              .map((_, i) => (
                <motion.div
                  key={`spark-${i}`}
                  className={`absolute top-1/2 left-1/2 rounded-full 
                  ${
                    i % 3 === 0
                      ? "bg-yellow-300 w-1.5 h-1.5"
                      : i % 3 === 1
                      ? "bg-yellow-200 w-2 h-2"
                      : "bg-yellow-100 w-1 h-1"
                  }`}
                  initial={{
                    scale: 0,
                    x: 0,
                    y: 0,
                    opacity: 1,
                    boxShadow: "0 0 4px 2px rgba(254, 240, 138, 0.8)",
                  }}
                  animate={{
                    scale: [0, 1.5, 0],
                    x: [0, (Math.random() * 40 - 20) * (i % 2 === 0 ? 1 : -1)],
                    y: [0, (Math.random() * 40 - 20) * (i % 2 === 0 ? -1 : 1)],
                    opacity: [1, 0],
                    boxShadow: [
                      "0 0 8px 4px rgba(254, 240, 138, 0.8)",
                      "0 0 2px 1px rgba(254, 240, 138, 0.2)",
                    ],
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{
                    duration: 0.7 + Math.random() * 0.3,
                    ease: [0.36, 0.07, 0.19, 0.97],
                  }}
                />
              ))}

            {/* Trailing spark particles */}
            {Array(12)
              .fill(0)
              .map((_, i) => (
                <motion.div
                  key={`micro-spark-${i}`}
                  className="absolute top-1/2 left-1/2 w-0.5 h-0.5 rounded-full bg-yellow-100"
                  initial={{
                    scale: 0,
                    x: 0,
                    y: 0,
                    opacity: 1,
                  }}
                  animate={{
                    scale: [0, 1, 0],
                    x: [0, (Math.random() * 30 - 15) * (i % 2 === 0 ? 1 : -1)],
                    y: [0, (Math.random() * 30 - 15) * (i % 2 === 0 ? -1 : 1)],
                    opacity: [1, 0],
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: i * 0.02,
                    ease: "easeOut",
                  }}
                />
              ))}
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export function KnowledgeReefView() {
  const {
    selectedTechnology,
    selectedVersion,
    technologies,
    versions,
    fetchTechnologies,
    selectTechnology,
    selectVersion,
    fetchVersions,
  } = useTechnologyStore();

  const {
    snippets,
    filteredSnippets,
    searchResults,
    pagination,
    searchQuery,
    concepts,
    selectedConcepts,
    isGlobalSearch,
    fetchSnippets,
    searchSnippets,
    searchByVector,
    setPage,
    setPerPage,
    fetchAllConcepts,
    toggleConceptFilter,
    clearConceptFilters,
    toggleGlobalSearch,
    isLoading,
  } = useSnippetStore();

  const { toggleTechnologySelector, activeView } = useUIStore();

  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(
    null
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [techFilterValue, setTechFilterValue] = useState<string | null>(null);
  const [versionFilterValue, setVersionFilterValue] = useState<string | null>(
    null
  );

  // Remove searchMode state since we'll only use vector search
  const [searchInputValue, setSearchInputValue] = useState("");
  const [lightningClicked, setLightningClicked] = useState(false);

  // Fetch snippets when technology/version changes or when switching to this view
  useEffect(() => {
    console.log("KnowledgeReef effectCheck:", { activeView, selectedVersion });
    if (selectedVersion && activeView === "knowledgeReef") {
      console.log("Fetching snippets for version:", selectedVersion.id);
      fetchSnippets(selectedVersion.id)
        .then(() => console.log("Snippets fetched successfully"))
        .catch((err) => {
          console.error("Error fetching snippets:", err);
          toast?.error("Failed to load documentation snippets", {
            description:
              err instanceof Error ? err.message : "Unknown error occurred",
          });
        });

      fetchAllConcepts()
        .then(() => console.log("Concepts fetched successfully"))
        .catch((err) => {
          console.error("Error fetching concepts:", err);
          toast?.error("Failed to load concepts", {
            description:
              err instanceof Error ? err.message : "Unknown error occurred",
          });
        });
    }
  }, [selectedVersion, fetchSnippets, fetchAllConcepts, activeView]);

  // Handle the case when the active view changes to knowledgeReef but selectedVersion is already set
  useEffect(() => {
    if (
      activeView === "knowledgeReef" &&
      selectedVersion &&
      snippets.length === 0 &&
      !isLoading
    ) {
      console.log(
        "View active with existing selection, loading snippets for:",
        selectedVersion.id
      );
      fetchSnippets(selectedVersion.id)
        .then(() => console.log("Snippets fetched on view activation"))
        .catch((err) => {
          console.error("Error fetching snippets on view activation:", err);
          toast?.error("Failed to load documentation snippets", {
            description:
              err instanceof Error ? err.message : "Unknown error occurred",
          });
        });

      if (concepts.length === 0) {
        fetchAllConcepts()
          .then(() => console.log("Concepts fetched on view activation"))
          .catch((err) => {
            console.error("Error fetching concepts on view activation:", err);
            toast?.error("Failed to load concepts", {
              description:
                err instanceof Error ? err.message : "Unknown error occurred",
            });
          });
      }
    }
  }, [
    activeView,
    selectedVersion,
    snippets.length,
    isLoading,
    concepts.length,
    fetchSnippets,
    fetchAllConcepts,
  ]);

  // Get the currently displayed items
  const displayedItems = useMemo(() => {
    // If we have search results, use those
    if (searchResults.length > 0) {
      console.log("Using search results for display:", searchResults.length);
      return searchResults;
    }

    // Otherwise, use the filtered snippets with pagination
    const startIndex = (pagination.page - 1) * pagination.perPage;
    const endIndex = Math.min(
      startIndex + pagination.perPage,
      filteredSnippets.length
    );

    console.log("Using filtered snippets for display:", {
      filteredCount: filteredSnippets.length,
      page: pagination.page,
      perPage: pagination.perPage,
      startIndex,
      endIndex,
      showing: filteredSnippets.slice(startIndex, endIndex).length,
    });

    return filteredSnippets.slice(startIndex, endIndex);
  }, [searchResults, filteredSnippets, pagination.page, pagination.perPage]);

  // Handle changing the page
  const handlePageChange = useCallback(
    (page: number) => {
      setPage(page);
    },
    [setPage]
  );

  // Handle changing the page size
  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      setPerPage(pageSize);
    },
    [setPerPage]
  );

  // Get the selected snippet
  const selectedSnippet = useMemo(() => {
    if (!selectedSnippetId) return null;

    // Check if the snippet is in the search results
    if (searchResults.length > 0) {
      const searchResult = searchResults.find(
        (result) => result.id === selectedSnippetId
      );
      if (searchResult) {
        // Convert search result to snippet format
        return {
          id: searchResult.id,
          title: searchResult.title,
          description: searchResult.description,
          content: searchResult.content,
          sourceUrl: searchResult.sourceUrl,
          technologyId: "", // Not available from search results
          versionId: "", // Not available from search results
          concepts: searchResult.concepts
            ? JSON.parse(searchResult.concepts)
            : [],
          createdAt: "",
          updatedAt: "",
        } as DocumentationSnippet;
      }
    }

    // Otherwise look in the normal snippets
    return snippets.find((snippet) => snippet.id === selectedSnippetId) || null;
  }, [selectedSnippetId, snippets, searchResults]);

  // Add a search submit function that only uses vector search
  const handleSearchSubmit = useCallback(() => {
    if (searchInputValue.trim()) {
      // Trigger lightning animation
      setLightningClicked(true);
      setTimeout(() => setLightningClicked(false), 1000);

      console.log("Executing vector search for:", searchInputValue);
      searchByVector(searchInputValue)
        .then(() => console.log("Search completed"))
        .catch((err) => {
          console.error("Search error:", err);
          toast.error("Search failed", {
            description:
              err instanceof Error ? err.message : "Unknown error occurred",
          });
        });
    }
  }, [searchInputValue, searchByVector]);

  // Handle technology filter change
  const handleTechFilterChange = useCallback(
    (techId: string) => {
      setTechFilterValue(techId);

      // Load versions for selected technology
      fetchVersions(techId);

      // Reset version filter
      setVersionFilterValue(null);
    },
    [fetchVersions]
  );

  // Handle version filter change
  const handleVersionFilterChange = useCallback(
    (versionId: string) => {
      setVersionFilterValue(versionId);

      // Load snippets for the selected version
      fetchSnippets(versionId);
    },
    [fetchSnippets]
  );

  const hasSelection = selectedTechnology && selectedVersion;

  const hasContentToShow = useMemo(() => {
    return searchResults.length > 0 || filteredSnippets.length > 0;
  }, [searchResults.length, filteredSnippets.length]);

  // Debug loading status
  useEffect(() => {
    console.log("Knowledge Reef loading status:", {
      activeView,
      hasSelection: !!selectedVersion,
      isLoading,
      snippetsCount: snippets.length,
      filteredSnippetsCount: filteredSnippets.length,
      searchResultsCount: searchResults.length,
      conceptsCount: concepts.length,
      selectedVersionId: selectedVersion?.id || null,
    });
  }, [
    activeView,
    selectedVersion,
    isLoading,
    snippets.length,
    filteredSnippets.length,
    searchResults.length,
    concepts.length,
  ]);

  return (
    <div className="bg-transparent mx-auto max-w-7xl px-4 md:px-6 pb-12">
      <div className="py-8 space-y-8">
        <motion.header
          className="mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-heading font-bold text-blue-50 mb-2">
            Knowledge Reef
          </h1>
          <p className="text-blue-200/90 text-lg">
            Explore documentation snippets for your technologies
          </p>
        </motion.header>

        {!hasSelection && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <GlassContainer
              depth="deep"
              className="p-10 rounded-xl"
              withNoise
              withCurrent
            >
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <h3 className="text-2xl font-medium mb-4 text-blue-100">
                  Select a Technology to Begin
                </h3>
                <p className="text-muted-foreground max-w-lg text-lg mb-8">
                  Choose a technology and version from the sidebar to explore
                  documentation snippets
                </p>
                <motion.button
                  className="button-high-contrast px-6 py-3 rounded-lg text-lg shadow-lg flex items-center gap-2"
                  whileHover={{
                    y: -3,
                    boxShadow: "0 10px 25px -5px rgba(59, 130, 246, 0.5)",
                  }}
                  whileTap={{ y: -1 }}
                  onClick={toggleTechnologySelector}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  Browse Technologies
                </motion.button>
              </div>
            </GlassContainer>
          </motion.div>
        )}

        {hasSelection && (
          <div className="space-y-6">
            {/* Search and filter area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <GlassContainer depth="surface" className="p-4 rounded-lg">
                {/* Completely revamped flex layout - search takes almost all space */}
                <div className="flex flex-col md:flex-row md:items-center md:space-x-2">
                  {/* Search Input - Modified to take much more space */}
                  <div className="relative md:w-[85%] flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-300/60 h-5 w-5" />
                    <div className="flex w-full">
                      <Input
                        placeholder="Search with AI..."
                        value={searchInputValue}
                        onChange={(e) => setSearchInputValue(e.target.value)}
                        className="pl-10 w-full flex-1 glass-input rounded-r-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSearchSubmit();
                          }
                        }}
                      />
                      <Button
                        className="glass-button rounded-l-none px-4 border-l-0 glass-bioluminescent"
                        onClick={handleSearchSubmit}
                        disabled={isLoading || !searchInputValue.trim()}
                      >
                        <span className="flex items-center gap-1 text-blue-50 shadow-glow">
                          <AnimatedLightning isClicked={lightningClicked} />
                          Search
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Global Search Toggle and Filters - now more compact */}
                  <div className="flex md:w-[15%] mt-2 md:mt-0 items-center justify-between md:justify-end space-x-2 flex-shrink-0">
                    {/* Global Search Toggle - more compact */}
                    <div className="flex items-center glass-depth-1 px-2 py-1 rounded-md text-xs">
                      <Switch
                        id="global-search"
                        checked={isGlobalSearch}
                        onCheckedChange={toggleGlobalSearch}
                        className={
                          isGlobalSearch
                            ? "glass-bioluminescent bg-blue-500/80 border-blue-400"
                            : "bg-blue-900/50 border-blue-800/50"
                        }
                      />
                      <label
                        htmlFor="global-search"
                        className="cursor-pointer flex items-center gap-1 ml-1"
                      >
                        <Globe
                          className={`h-3.5 w-3.5 ${
                            isGlobalSearch
                              ? "text-blue-300 animate-pulse"
                              : "text-blue-400/50"
                          }`}
                        />
                        <span className="hidden sm:inline">Global</span>
                      </label>
                    </div>

                    {/* Filter Button - more compact */}
                    <Button
                      variant={isFilterOpen ? "default" : "outline"}
                      className={`glass-button flex items-center gap-1 h-7 text-xs px-2 ${
                        isFilterOpen ? "glass-current" : "glass-surface"
                      }`}
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                    >
                      <Filter className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Filters</span>
                      {selectedConcepts.length > 0 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/30 text-xs font-medium">
                          {selectedConcepts.length}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Filter panel */}
                <AnimatePresence>
                  {isFilterOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 border-t border-blue-800/30 pt-4 space-y-4">
                        {/* Technology and Version Filters */}
                        <div className="flex flex-wrap gap-4">
                          {/* Technology filter */}
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-blue-300/60" />
                            <span className="text-sm text-blue-200">
                              Technology:
                            </span>
                            <Select
                              value={
                                techFilterValue || selectedTechnology?.id || ""
                              }
                              onValueChange={handleTechFilterChange}
                            >
                              <SelectTrigger className="w-[180px] glass-depth-1">
                                <SelectValue placeholder="Select technology" />
                              </SelectTrigger>
                              <SelectContent>
                                {technologies.map((tech) => (
                                  <SelectItem key={tech.id} value={tech.id}>
                                    {tech.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Version filter */}
                          <div className="flex items-center gap-2">
                            <Code className="h-4 w-4 text-blue-300/60" />
                            <span className="text-sm text-blue-200">
                              Version:
                            </span>
                            <Select
                              value={
                                versionFilterValue || selectedVersion?.id || ""
                              }
                              onValueChange={handleVersionFilterChange}
                            >
                              <SelectTrigger className="w-[180px] glass-depth-1">
                                <SelectValue placeholder="Select version" />
                              </SelectTrigger>
                              <SelectContent>
                                {versions.map((ver) => (
                                  <SelectItem key={ver.id} value={ver.id}>
                                    {ver.version}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Concept filters */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-blue-200 flex items-center gap-2">
                              <Info className="h-4 w-4 text-blue-300/60" />
                              Filter by Concepts:
                            </h3>

                            {selectedConcepts.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 px-2"
                                onClick={clearConceptFilters}
                              >
                                Clear All
                              </Button>
                            )}
                          </div>

                          {/* Selected concepts */}
                          {selectedConcepts.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {selectedConcepts.map((concept, i) => (
                                <ConceptBadge
                                  key={concept}
                                  concept={concept}
                                  isSelected={true}
                                  showRemove={true}
                                  onRemove={() => toggleConceptFilter(concept)}
                                  animationDelay={i * 0.03}
                                />
                              ))}
                            </div>
                          )}

                          {/* Available concepts */}
                          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 glass-depth-1 rounded-md">
                            {concepts
                              .filter((c) => !selectedConcepts.includes(c))
                              .map((concept, i) => (
                                <ConceptBadge
                                  key={concept}
                                  concept={concept}
                                  isSelected={false}
                                  onClick={() => toggleConceptFilter(concept)}
                                  animationDelay={i * 0.01}
                                />
                              ))}

                            {concepts.length === 0 && (
                              <div className="w-full text-center py-2 text-sm text-blue-300/60">
                                No concepts available
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassContainer>
            </motion.div>

            {/* Main content area with snippets list and viewer */}
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Snippets list - Made fully scrollable */}
              <motion.div
                className="w-[50%] h-fit max-h-[70vh] flex flex-col"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <GlassContainer
                  depth="deep"
                  className="h-full rounded-xl flex flex-col overflow-hidden"
                  withNoise
                >
                  <div className="p-4 border-b border-blue-800/30 flex-shrink-0">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-medium text-blue-100">
                        {searchResults.length > 0
                          ? "Search Results"
                          : "Documentation Snippets"}
                      </h2>
                      <span className="text-sm text-blue-300/70">
                        {searchResults.length > 0
                          ? pagination.totalCount
                          : filteredSnippets.length}{" "}
                        items
                      </span>
                    </div>

                    {searchQuery && (
                      <div className="mt-1 flex items-center text-sm text-blue-300/70">
                        <span className="mr-1">Searching:</span>
                        <span className="rounded bg-blue-800/30 px-1.5 py-0.5 text-blue-200 ml-1 flex-1 truncate">
                          "{searchQuery}"
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-1 h-7 w-7 p-0 text-blue-300/70"
                          onClick={() => {
                            setSearchInputValue("");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Content area */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {isLoading && (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="rounded-full h-10 w-10 border-2 border-t-transparent border-blue-500 animate-spin"></div>
                          <span className="text-sm text-blue-300/70">
                            Loading...
                          </span>
                        </div>
                      </div>
                    )}

                    {!isLoading && displayedItems.length === 0 && (
                      <div className="flex-1 flex items-center justify-center p-8 text-center">
                        <div>
                          <p className="text-blue-300/60 mb-2">
                            No snippets found
                          </p>
                          {searchQuery && (
                            <p className="text-sm text-blue-300/40">
                              Try adjusting your search query or filters
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {!isLoading && displayedItems.length > 0 && (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <ScrollArea className="flex-1 overflow-y-auto">
                          <div className="space-y-4 p-4 px-2 w-[calc(100%-8px)]">
                            {searchResults.length > 0
                              ? (displayedItems as SearchResult[]).map(
                                  (result, index) => (
                                    <SearchResultCard
                                      key={result.id}
                                      result={result}
                                      isSelected={
                                        selectedSnippetId === result.id
                                      }
                                      onClick={() =>
                                        setSelectedSnippetId(result.id)
                                      }
                                      index={index}
                                    />
                                  )
                                )
                              : (displayedItems as DocumentationSnippet[]).map(
                                  (snippet, index) => (
                                    <SnippetCard
                                      key={snippet.id}
                                      snippet={snippet}
                                      isSelected={
                                        selectedSnippetId === snippet.id
                                      }
                                      onClick={() =>
                                        setSelectedSnippetId(snippet.id)
                                      }
                                      index={index}
                                    />
                                  )
                                )}
                          </div>
                        </ScrollArea>

                        {/* Pagination controls - positioned outside the ScrollArea */}
                        {hasContentToShow && !isLoading && (
                          <div className="flex-shrink-0 border-t border-blue-800/30 sticky bottom-0 bg-blue-900/50 backdrop-blur-sm z-10">
                            <Pagination
                              currentPage={pagination.page}
                              totalPages={pagination.totalPages}
                              totalItems={
                                searchResults.length > 0
                                  ? pagination.totalCount
                                  : filteredSnippets.length
                              }
                              pageSize={pagination.perPage}
                              onPageChange={handlePageChange}
                              onPageSizeChange={handlePageSizeChange}
                              pageSizeOptions={[5, 10, 20, 50]}
                              className="py-2 px-2"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </GlassContainer>
              </motion.div>

              {/* Snippet viewer */}
              <motion.div
                className="lg:w-2/3 h-fit max-h-[70vh] flex-grow overflow-y-scroll"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <GlassContainer
                  depth="abyss"
                  className="h-full rounded-xl overflow-hidden"
                  withNoise
                >
                  {selectedSnippet ? (
                    <SnippetViewer
                      snippet={selectedSnippet}
                      similarity={
                        searchResults.length > 0 && selectedSnippetId
                          ? searchResults.find(
                              (r) => r.id === selectedSnippetId
                            )?.similarity
                          : undefined
                      }
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <h3 className="text-xl font-medium text-blue-200/80 mb-2">
                        Select a snippet
                      </h3>
                      <p className="text-blue-300/60 max-w-md">
                        Choose a documentation snippet from the list to view its
                        contents
                      </p>
                    </div>
                  )}
                </GlassContainer>
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
