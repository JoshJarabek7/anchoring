import { cn } from "@/lib/utils";
import { motion, useAnimationFrame } from "framer-motion";
import * as React from "react";
import { useRef } from "react";
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
  showWaveEffect = true,
  waveOpacity = 0.6,
  waveColor = "rgba(255, 255, 255, 0.2)",
  height = "md",
  striations = false,
  glowEffect = false,
  ...props
}: WaveProgressProps) {
  const heightClass = 
    height === "sm" ? "h-1" : 
    height === "lg" ? "h-3" : 
    "h-2";
    
  const progressRef = useRef<HTMLDivElement>(null);
  const [wavePosition, setWavePosition] = React.useState(0);
  
  // Wave animation using Framer Motion's useAnimationFrame for smooth animation
  useAnimationFrame((time) => {
    if (!showWaveEffect || !progressRef.current) return;
    // Create a smooth wave motion
    const newPosition = Math.sin(time / 500) * 5;
    setWavePosition(newPosition);
  });

  return (
    <div className={cn("relative", glowEffect && "glow-container")}>
      <Progress 
        value={value} 
        className={cn(
          heightClass,
          striations && "glass-depth-striations",
          "overflow-hidden",
          className
        )}
        {...props}
      />
      
      {showWaveEffect && value && value > 0 && (
        <div 
          className="absolute top-0 left-0 h-full pointer-events-none overflow-hidden"
          style={{ width: `${value}%` }}
          ref={progressRef}
        >
          <motion.div
            className="absolute inset-0 opacity-30"
            animate={{
              backgroundPosition: ["0% 0%", "100% 0%"],
            }}
            transition={{
              duration: 3,
              ease: "linear",
              repeat: Infinity,
            }}
            style={{
              backgroundImage: `
                radial-gradient(ellipse at top, ${waveColor} 0%, transparent 70%),
                radial-gradient(ellipse at bottom, ${waveColor} 0%, transparent 70%)
              `,
              backgroundSize: "40px 40px",
              filter: "blur(4px)",
              transform: `translateY(${wavePosition}px)`,
            }}
          />
          
          {/* Additional ripple effect for more fluid animation */}
          <motion.div
            className={cn(
              "absolute h-[200%] w-[100px] opacity-20",
              "bg-gradient-to-r from-transparent via-white to-transparent"
            )}
            style={{ 
              filter: "blur(8px)",
              top: "-50%",
            }}
            animate={{
              left: ["-100px", "100%"],
              opacity: [0, 0.2, 0],
            }}
            transition={{
              duration: 2.5,
              ease: "easeInOut",
              repeat: Infinity,
              repeatDelay: 1,
            }}
          />
        </div>
      )}
      
      {striations && (
        <div className="absolute inset-0 pointer-events-none glass-depth-striations opacity-30" />
      )}
      
      {/* Glow effect for active progress bars */}
      {glowEffect && value && value > 0 && (
        <div 
          className="absolute top-0 left-0 h-full dark:blur-[1px] pointer-events-none"
          style={{ 
            width: `${value}%`, 
            background: `linear-gradient(90deg, 
              transparent, 
              rgba(80, 200, 240, 0.2), 
              rgba(80, 220, 255, 0.4)
            )`,
            filter: "blur(2px)"
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
  status: 'idle' | 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
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
          showWaveEffect={stages.some(s => s.status === 'active')}
          striations={true}
          glowEffect={true}
        />
      </div>
      
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="space-y-3 pt-2"
        >
          {stages.map((stage, index) => (
            <motion.div
              key={stage.id}
              className="space-y-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07, duration: 0.3 }}
            >
              <div className="flex justify-between text-xs">
                <span 
                  className={cn(
                    "text-muted-foreground",
                    stage.status === 'active' && "text-primary font-medium"
                  )}
                >
                  {stage.name}
                </span>
                <span className="text-muted-foreground">{stage.progress}%</span>
              </div>
              <WaveProgress
                value={stage.progress}
                height="sm"
                showWaveEffect={stage.status === 'active'}
                waveOpacity={0.5}
                glowEffect={stage.status === 'active'}
                className={cn(
                  stage.status === 'active' && "glass-current"
                )}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}