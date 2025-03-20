import { CrawlConfiguration } from '@/components/deep-dive/crawl-configuration';
import { MarkdownCleaning } from '@/components/deep-dive/markdown-cleaning';
import { SnippetGeneration } from '@/components/deep-dive/snippet-generation';
import { TechnologyManagement } from '@/components/deep-dive/technology-management';
import { UrlProcessing } from '@/components/deep-dive/url-processing';
import { Button } from '@/components/ui/button';
import { GlassContainer } from '@/components/ui/glass-container';
import { useTechnologyStore } from '@/stores/technology-store';
import { useUIStore } from '@/stores/ui-store';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

export function DeepDiveView() {
  const { selectedTechnology, selectedVersion } = useTechnologyStore();
  const { toggleTechnologySelector } = useUIStore();
  
  const hasSelection = selectedTechnology && selectedVersion;
  
  return (
    <div className="bg-transparent mx-auto max-w-5xl px-4 pb-12">
      <div className="py-6 space-y-6">
        <motion.header 
          className="mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-heading font-bold text-blue-900 dark:text-blue-50 mb-2">Deep Dive</h1>
          <p className="text-blue-800/80 dark:text-blue-200/90 text-base">
            Collect, process, and organize documentation for your technologies
          </p>
        </motion.header>
        
        {/* Vertical Pipeline Flow with improved spacing */}
        <div className="space-y-6">
          {/* Stage 1: Technology Management */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <TechnologyManagement />
          </motion.div>
          
          {/* Conditional stages - only show when technology and version are selected */}
          {hasSelection && (
            <div className="space-y-6">
              {/* Stage 2: Crawl Configuration */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <CrawlConfiguration />
              </motion.div>
              
              {/* Stage 3: URL Processing */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <UrlProcessing />
              </motion.div>
              
              {/* Stage 4: Markdown Cleaning */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <MarkdownCleaning />
              </motion.div>
              
              {/* Stage 5: Snippet Generation */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <SnippetGeneration />
              </motion.div>
            </div>
          )}
          
          {!hasSelection && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <GlassContainer 
                depth="deep" 
                className="p-6 rounded-xl"
                withNoise
                withCurrent
              >
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <h3 className="text-xl font-medium mb-3 text-blue-900 dark:text-blue-100">Select a Technology to Begin</h3>
                  <p className="text-muted-foreground max-w-lg text-sm mb-5">
                    Choose a technology and version from the sidebar to start your deep dive, or create a new one if you're just getting started
                  </p>
                  <Button 
                    className="button-high-contrast px-4 py-1.5 rounded-lg text-sm shadow-md flex items-center gap-1.5"
                    onClick={toggleTechnologySelector}
                  >
                    <Plus className="h-4 w-4" />
                    Get Started
                  </Button>
                </div>
              </GlassContainer>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}