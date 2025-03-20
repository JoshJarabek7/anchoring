import { cn } from '@/lib/utils';
import { useTechnologyStore } from '@/stores/technology-store';
import { useUIStore } from '@/stores/ui-store';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Book, Code, Database, Plus, Settings } from 'lucide-react';
import { memo } from 'react';
import { Button } from '../ui/button';
import { ThemeToggle } from './theme-toggle';

interface TitleBarProps {
  title?: string;
}

// Memoized component to prevent unnecessary re-renders
export const TitleBar = memo(({ title = "Anchoring" }: TitleBarProps) => {
  const { 
    toggleTaskQueue,
    toggleSettings,
    toggleTechnologySelector,
    activeView,
    setActiveView
  } = useUIStore();
  
  const { selectedTechnology, selectedVersion } = useTechnologyStore();
  
  return (
    <div
      className={cn(
        'top-2 left-4 right-4 h-9 z-[100]',
        'flex items-center justify-between pointer-events-auto will-change-transform w-full '
      )}
    >
      <motion.div
        className="w-full h-full flex items-center justify-between px-2 bg-white/90 dark:bg-[#0a2642]/90 rounded-xl backdrop-blur-md border border-white/15 dark:border-blue-800/30 shadow-lg glass-bioluminescent"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Left section - App title and Technology button */}
        <div className="flex items-center gap-1.5">
          <h1 className="text-xs font-semibold text-foreground ml-1">
            {title}
          </h1>
          
          {/* Technology Selection Button */}
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              key="tech-button"
              className="ml-1.5"
            >
              <Button 
                onClick={toggleTechnologySelector}
                className="h-6 px-1.5 py-0 bg-white/50 dark:bg-[#0a3056]/70 rounded-lg text-xs"
                variant="ghost"
                size="sm"
              >
                {selectedTechnology ? (
                  <span className="flex items-center gap-1">
                    <Code className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    {selectedTechnology.name}
                    {selectedVersion && (
                      <>
                        <span className="text-blue-900/50 dark:text-blue-400/50 text-[10px]">/</span>
                        <span className="text-blue-900 dark:text-blue-100 text-[10px]">
                          {selectedVersion.version}
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    Select Tech
                  </span>
                )}
              </Button>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Center section: View selection tabs */}
        <div className="flex-1 flex justify-center items-center">
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveView('deepDive')}
              className={cn(
                "flex items-center h-6 px-2 py-1 rounded-md transition-colors text-xs",
                activeView === 'deepDive' 
                  ? 'bg-blue-500/10 dark:bg-blue-600/20 text-blue-800 dark:text-blue-300 glass-bioluminescent' 
                  : 'text-blue-700/70 dark:text-blue-300/70 hover:bg-blue-500/5 dark:hover:bg-blue-600/10'
              )}
            >
              <Database className="h-3 w-3 mr-1" />
              Deep Dive
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveView('knowledgeReef')}
              className={cn(
                "flex items-center h-6 px-2 py-1 rounded-md transition-colors text-xs",
                activeView === 'knowledgeReef' 
                  ? 'bg-blue-500/10 dark:bg-blue-600/20 text-blue-800 dark:text-blue-300 glass-bioluminescent' 
                  : 'text-blue-700/70 dark:text-blue-300/70 hover:bg-blue-500/5 dark:hover:bg-blue-600/10'
              )}
            >
              <Book className="h-3 w-3 mr-1" />
              Knowledge Reef
            </Button>
          </div>
        </div>

        {/* Right section - Actions and controls */}
        <div className="flex items-center gap-1">
          {/* Action buttons */}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleTaskQueue}
            className="h-6 w-6 bg-white/50 dark:bg-[#0a3056]/70 rounded-lg"
            aria-label="Tasks"
          >
            <Activity className="h-3.5 w-3.5 text-blue-900 dark:text-blue-200" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleSettings}
            className="h-6 w-6 bg-white/50 dark:bg-[#0a3056]/70 rounded-lg"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5 text-blue-900 dark:text-blue-200" />
          </Button>
          
          <ThemeToggle />
        </div>
      </motion.div>
    </div>
  );
});