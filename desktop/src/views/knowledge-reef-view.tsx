import { SnippetCard } from '@/components/knowledge-reef/snippet-card';
import { SnippetViewer } from '@/components/knowledge-reef/snippet-viewer';
import { Button } from '@/components/ui/button';
import { GlassContainer } from '@/components/ui/glass-container';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSnippetStore } from '@/stores/snippet-store';
import { useTechnologyStore } from '@/stores/technology-store';
import { useUIStore } from '@/stores/ui-store';
import { motion } from 'framer-motion';
import { Filter, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function KnowledgeReefView() {
  const { selectedTechnology, selectedVersion } = useTechnologyStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  
  const { toggleTechnologySelector } = useUIStore();
  const { snippets, filteredSnippets, fetchSnippets, searchSnippets } = useSnippetStore();
  
  // Fetch snippets when technology/version changes
  useEffect(() => {
    if (selectedVersion) {
      fetchSnippets(selectedVersion.id);
    }
  }, [selectedVersion, fetchSnippets]);
  
  // Update search results when query changes
  useEffect(() => {
    searchSnippets(searchQuery);
  }, [searchQuery, searchSnippets]);
  
  const hasSelection = selectedTechnology && selectedVersion;
  
  const selectedSnippet = selectedSnippetId ? 
    snippets.find(snippet => snippet.id === selectedSnippetId) : null;
  
  return (
    <div className="bg-transparent mx-auto max-w-7xl px-6 md:px-8 pb-12">
      <div className="py-10 space-y-8">
        <motion.header 
          className="mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-heading font-bold text-blue-900 dark:text-blue-50 mb-3">Knowledge Reef</h1>
          <p className="text-blue-800/80 dark:text-blue-200/90 text-lg">
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
                <h3 className="text-2xl font-medium mb-4 text-blue-900 dark:text-blue-100">Select a Technology to Begin</h3>
                <p className="text-muted-foreground max-w-lg text-lg mb-8">
                  Choose a technology and version from the sidebar to explore documentation snippets
                </p>
                <motion.button 
                  className="button-high-contrast px-6 py-3 rounded-lg text-lg shadow-lg flex items-center gap-2"
                  whileHover={{ y: -3, boxShadow: "0 10px 25px -5px rgba(59, 130, 246, 0.5)" }}
                  whileTap={{ y: -1 }}
                  onClick={toggleTechnologySelector}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
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
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500/60 dark:text-blue-300/60 h-5 w-5" />
                    <Input 
                      placeholder="Search snippets, concepts, or content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 glass-input"
                    />
                  </div>
                  <Button 
                    variant="outline"
                    className="glass-button glass-surface flex items-center gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                  </Button>
                </div>
              </GlassContainer>
            </motion.div>
            
            {/* Main content area with snippets list and viewer */}
            <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-300px)]">
              {/* Snippets list */}
              <motion.div 
                className="lg:w-1/3 h-[350px] lg:h-full"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <GlassContainer depth="deep" className="h-full rounded-xl overflow-hidden" withNoise>
                  <div className="p-4 border-b border-white/10 dark:border-blue-800/30">
                    <h2 className="text-lg font-medium text-blue-900 dark:text-blue-100">Documentation Snippets</h2>
                    <p className="text-sm text-blue-800/60 dark:text-blue-300/70 mt-1">
                      {filteredSnippets.length} snippets found
                    </p>
                  </div>
                  
                  <ScrollArea className="h-[calc(100%-70px)] p-4">
                    <div className="space-y-4">
                      {filteredSnippets.length > 0 ? filteredSnippets.map((snippet, index) => (
                        <SnippetCard 
                          key={snippet.id}
                          snippet={snippet}
                          isSelected={selectedSnippetId === snippet.id}
                          onClick={() => setSelectedSnippetId(snippet.id)}
                          index={index}
                        />
                      )) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                          <p className="text-blue-800/60 dark:text-blue-300/60">No snippets match your search</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </GlassContainer>
              </motion.div>
              
              {/* Snippet viewer */}
              <motion.div 
                className="lg:w-2/3 h-[500px] lg:h-full"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <GlassContainer depth="abyss" className="h-full rounded-xl" withNoise>
                  {selectedSnippet ? (
                    <SnippetViewer snippet={selectedSnippet} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <h3 className="text-xl font-medium text-blue-800/80 dark:text-blue-200/80 mb-2">Select a snippet</h3>
                      <p className="text-blue-800/60 dark:text-blue-300/60 max-w-md">
                        Choose a documentation snippet from the list to view its contents
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