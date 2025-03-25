import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";
import { useEffect, useState } from "react";
import { Progress } from "./progress";

type WaveProgressProps = React.ComponentProps<typeof Progress> & {
  showWaveEffect?: boolean;
  waveOpacity?: number;
  waveColor?: string;
  height?: "sm" | "md" | "lg";
  striations?: boolean;
  glowEffect?: boolean;
};

export function WaveProgress({
  value,
  className,
  showWaveEffect = false,
  waveOpacity = 0.6,
  waveColor = "rgba(255, 255, 255, 0.2)",
  height = "md",
  striations = false,
  glowEffect = true,
  ...props
}: WaveProgressProps) {
  const heightClass = height === "sm" ? "h-1" : height === "lg" ? "h-3" : "h-2";

  // Check if user prefers reduced motion for accessibility
  const prefersReducedMotion = useReducedMotion();

  // Window focus detection for performance optimization
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Set initial focus state
    setIsWindowFocused(document.hasFocus());

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Determine if we should show animations
  const showAnimations = !prefersReducedMotion && isWindowFocused;

  return (
    <div
      className={cn(
        "relative",
        glowEffect && showAnimations && "glow-container"
      )}
    >
      <Progress
        value={value}
        className={cn(
          heightClass,
          striations && showAnimations && "glass-depth-striations",
          "overflow-hidden",
          className
        )}
        {...props}
      />

      {/* Bioluminescent glow effect - always enabled */}
      {glowEffect && value && value > 0 && (
        <div
          className="absolute top-0 left-0 h-full pointer-events-none"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, 
              rgba(56, 189, 248, 0.1),
              rgba(56, 189, 248, 0.3) 50%,
              rgba(56, 189, 248, 0.1)
            )`,
            boxShadow: "0 0 15px rgba(56, 189, 248, 0.4)",
            borderRadius: "inherit",
          }}
        />
      )}
    </div>
  );
}

// Multi-stage progress component
type StageType = {
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

type MultiStageProgressProps = {
  stages: StageType[];
  className?: string;
  expanded?: boolean;
};

export function MultiStageProgress({
  stages,
  className,
  expanded = false,
}: MultiStageProgressProps) {
  // Check if user prefers reduced motion for accessibility
  const prefersReducedMotion = useReducedMotion();

  if (!stages || stages.length === 0) {
    return null;
  }

  // Calculate overall progress
  const overallProgress =
    stages.reduce((total, stage) => total + stage.progress, 0) / stages.length;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative">
        <WaveProgress
          value={overallProgress}
          showWaveEffect={false}
          striations={!prefersReducedMotion}
          glowEffect={true}
        />
      </div>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            type: prefersReducedMotion ? "tween" : "spring",
            damping: 25,
            stiffness: 300,
            duration: prefersReducedMotion ? 0.1 : undefined,
          }}
          className="space-y-3 pt-2"
        >
          {stages.map((stage, index) => (
            <motion.div
              key={stage.id}
              className="space-y-1"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: prefersReducedMotion ? 0 : index * 0.07,
                duration: prefersReducedMotion ? 0.1 : 0.3,
              }}
            >
              <div className="flex justify-between text-xs">
                <span
                  className={cn(
                    "text-muted-foreground",
                    stage.status === "active" && "text-primary font-medium"
                  )}
                >
                  {stage.name}
                </span>
                <span className="text-muted-foreground">{stage.progress}%</span>
              </div>
              <WaveProgress
                value={stage.progress}
                height="sm"
                showWaveEffect={false}
                glowEffect={stage.status === "active"}
                className={cn(stage.status === "active" && "glass-current")}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
