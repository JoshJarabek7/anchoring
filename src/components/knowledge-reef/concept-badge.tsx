import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface ConceptBadgeProps {
  concept: string;
  isSelected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  showRemove?: boolean;
  animationDelay?: number;
}

export const ConceptBadge = ({
  concept,
  isSelected = false,
  onClick,
  onRemove,
  className,
  showRemove = false,
  animationDelay = 0,
}: ConceptBadgeProps) => {
  return (
    <motion.div
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all",
        isSelected
          ? "bg-blue-500/40 text-blue-50 glass-bioluminescent shadow-sm"
          : "bg-blue-500/10 text-blue-300/90 hover:bg-blue-500/20",
        onClick && "cursor-pointer",
        className
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: animationDelay,
        duration: 0.2,
        type: "spring",
        stiffness: 500,
        damping: 25,
      }}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <span>{concept}</span>
      {showRemove && onRemove && (
        <button
          className="ml-1 rounded-full hover:bg-blue-400/20 p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </motion.div>
  );
};
