import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Code, ExternalLink } from "lucide-react";

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

export const SnippetCard = ({
  snippet,
  isSelected,
  onClick,
  index,
}: SnippetCardProps) => {
  return (
    <motion.div
      className={cn(
        "p-3 rounded-lg cursor-pointer transition-all duration-200 will-change-transform w-full box-border",
        isSelected
          ? "glass-current glass-bioluminescent shadow-md"
          : "glass-surface hover:glass-depth-1 hover:shadow-sm"
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-start gap-2 w-full">
        <div className="rounded-full bg-blue-500/20 p-1.5 flex-shrink-0">
          <Code className="h-4 w-4 text-blue-300" />
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="text-sm font-medium text-blue-50 mb-1 break-words line-clamp-2">
            {snippet.title}
          </h3>

          <p className="text-xs text-blue-200 mb-2 line-clamp-2 break-words overflow-hidden text-ellipsis">
            {snippet.description}
          </p>

          {snippet.concepts && snippet.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 overflow-hidden">
              {snippet.concepts.slice(0, 2).map((concept) => (
                <span
                  key={concept}
                  className="inline-flex text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-200 truncate"
                >
                  {concept}
                </span>
              ))}
              {snippet.concepts.length > 2 && (
                <span className="inline-flex text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-200">
                  +{snippet.concepts.length - 2} more
                </span>
              )}
            </div>
          )}

          <div className="flex items-center mt-1.5 text-xs text-blue-300">
            <ExternalLink className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="truncate overflow-hidden text-ellipsis">
              {snippet.sourceUrl}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
