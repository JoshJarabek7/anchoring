import { cn } from "@/lib/utils";
import { SearchResult } from "@/stores/snippet-store";
import { motion } from "framer-motion";
import { Code, ExternalLink, Zap } from "lucide-react";

interface SearchResultCardProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

export const SearchResultCard = ({
  result,
  isSelected,
  onClick,
  index,
}: SearchResultCardProps) => {
  // Parse concepts if they exist
  let concepts: string[] = [];
  if (result.concepts) {
    try {
      // Try to parse as JSON array
      concepts = JSON.parse(result.concepts) as string[];
    } catch (e) {
      // If that fails, handle as comma-separated string
      concepts = result.concepts
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log("Parsed concepts from comma-separated string:", concepts);
    }
  }

  // Format similarity score as percentage
  // The backend uses cosine distance with the <-> operator in pgvector
  // For cosine distance: 0 = identical vectors, 2 = completely opposite vectors
  const similarityValue = result.similarity || 0;

  // Convert cosine distance to a percentage:
  // 0 (identical) → 100%
  // 2 (opposite) → 0%
  const similarityPercentage = Math.max(
    0,
    Math.min(100, Math.round((1 - similarityValue / 2) * 100))
  );

  return (
    <motion.div
      className={cn(
        "p-3 rounded-lg cursor-pointer transition-all duration-200 will-change-transform relative overflow-hidden w-full box-border",
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
          <div className="flex justify-between items-start mb-1">
            <h3 className="text-sm font-medium text-blue-50 pr-12 break-words line-clamp-2">
              {result.title}
            </h3>

            {/* Similarity badge */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 bg-blue-500/30 rounded-full px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0">
              <Zap className="h-2.5 w-2.5 text-blue-200" />
              <span className="text-blue-50">{similarityPercentage}%</span>
            </div>
          </div>

          <p className="text-xs text-blue-200 mb-1.5 line-clamp-2 break-words overflow-hidden text-ellipsis">
            {result.description}
          </p>

          {/* Technology and version */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-100 truncate max-w-full">
              {result.technologyName}/{result.version}
            </span>
          </div>

          {concepts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 overflow-hidden">
              {concepts.slice(0, 2).map((concept) => (
                <span
                  key={concept}
                  className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-200 truncate"
                >
                  {concept}
                </span>
              ))}
              {concepts.length > 2 && (
                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-200">
                  +{concepts.length - 2} more
                </span>
              )}
            </div>
          )}

          <div className="flex items-center mt-1.5 text-xs text-blue-300">
            <ExternalLink className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="truncate overflow-hidden text-ellipsis">
              {result.sourceUrl}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
