import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Code, ExternalLink } from 'lucide-react';

interface DocumentationSnippet {
  id: string;
  title: string;
  description: string;
  content: string;
  sourceUrl: string;
  technologyId: string;
  versionId: string;
  concepts?: string[];
}

interface SnippetCardProps {
  snippet: DocumentationSnippet;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

export const SnippetCard = ({ snippet, isSelected, onClick, index }: SnippetCardProps) => {
  return (
    <motion.div 
      className={cn(
        "p-4 rounded-lg cursor-pointer transition-all duration-200 will-change-transform",
        isSelected 
          ? "glass-current dark:glass-bioluminescent shadow-md" 
          : "glass-surface hover:glass-depth-1 hover:shadow-sm"
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-blue-100 dark:bg-blue-500/20 p-2 flex-shrink-0">
          <Code className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        
        <div className="flex-1">
          <h3 className="text-md font-medium text-blue-900 dark:text-blue-100 mb-1">
            {snippet.title}
          </h3>
          
          <p className="text-sm text-blue-800/70 dark:text-blue-300/80 mb-2">
            {snippet.description}
          </p>
          
          {snippet.concepts && snippet.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {snippet.concepts.map(concept => (
                <span 
                  key={concept} 
                  className="inline-flex text-xs px-2 py-0.5 rounded-full bg-blue-100/50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}
          
          <div className="flex items-center mt-2 text-xs text-blue-700/70 dark:text-blue-400/70">
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            <span className="truncate">{snippet.sourceUrl}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
