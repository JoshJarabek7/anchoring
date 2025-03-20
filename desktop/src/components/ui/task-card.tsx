import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { MultiStageProgress, WaveProgress } from "./wave-progress";

export type TaskStage = {
  id: string;
  name: string;
  progress: number;
  status:
    | "idle"
    | "pending"
    | "active"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
};

export type TaskCardProps = {
  id: string;
  title: string;
  description?: string;
  progress: number;
  status:
    | "idle"
    | "pending"
    | "active"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  stages?: TaskStage[];
  created: Date;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  className?: string;
};

export const TaskCard = React.memo(
  ({
    id,
    title,
    description,
    progress,
    status,
    stages = [],
    created,
    onPause,
    onResume,
    onCancel,
    className,
  }: TaskCardProps) => {
    // Determine task state
    const isActive = status === "active";
    const isPaused = status === "paused";
    const isCompleted = status === "completed";
    const isFailed = status === "failed";
    const isCancelled = status === "cancelled";

    // Auto-expand active tasks with stages
    const [expanded, setExpanded] = useState(isActive && stages.length > 0);

    // Calculate time elapsed
    const [timeElapsed, setTimeElapsed] = useState("");
    useEffect(() => {
      const calculateTime = () => {
        const now = new Date();
        const diff = now.getTime() - created.getTime();
        const seconds = Math.floor(diff / 1000);
        setTimeElapsed(`${seconds}s`);
      };

      calculateTime();
      const timer = setInterval(calculateTime, 1000);
      return () => clearInterval(timer);
    }, [created]);

    // Status badge style
    const getBadgeClass = () => {
      if (isCompleted) return "bg-green-500/70 text-white";
      if (isFailed) return "bg-destructive/80 text-white";
      if (isCancelled) return "bg-muted text-foreground/90";
      if (isPaused) return "bg-amber-500/70 text-white";
      if (isActive) return "bg-primary/70 dark:glass-bioluminescent text-white";
      return "bg-muted/60 text-foreground/90";
    };

    return (
      <motion.div
        className={cn(
          "glass-surface px-3 py-2 rounded-md overflow-hidden transition-all duration-300",
          isActive && "glass-depth-1",
          className
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        layoutId={`task-card-${id}`}
      >
        <div className="flex items-center gap-2 mb-1">
          {/* Task title */}
          <div className="flex-1 text-sm font-medium truncate">{title}</div>

          {/* Status badge */}
          <div
            className={cn(
              "text-xs rounded-full px-2 py-0.5 flex items-center font-medium",
              getBadgeClass()
            )}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </div>

          {/* Time elapsed */}
          <div className="text-xs text-foreground/60">{timeElapsed}</div>

          {/* Cancel button */}
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-destructive/70 hover:text-destructive p-1 rounded-sm hover:bg-destructive/10"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Display active stage information */}
        {isActive && stages.length > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <div className="text-xs text-foreground/70 italic">
              {(() => {
                // Find the active stage
                const activeStage = stages.find(
                  (stage) => stage.status === "active"
                );
                if (activeStage) {
                  return `Stage: ${activeStage.name} (${activeStage.progress}%)`;
                }
                // If no active stage, show the latest stage
                const latestStage = stages[stages.length - 1];
                return latestStage ? `Stage: ${latestStage.name}` : null;
              })()}
            </div>
          </div>
        )}

        {/* Progress bar row */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <WaveProgress
              value={progress}
              showWaveEffect={isActive}
              height="sm"
              glowEffect={isActive}
            />
          </div>
          <div className="text-xs text-foreground/80 w-8 text-right">
            {progress}%
          </div>
        </div>

        {/* Expandable stages section */}
        {stages.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full mt-1 text-xs text-foreground/60 hover:text-foreground/80 flex items-center justify-center"
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  className="mt-1"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MultiStageProgress stages={stages} expanded={true} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    );
  }
);

TaskCard.displayName = "TaskCard";
