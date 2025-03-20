"use client"

import * as ProgressPrimitive from "@radix-ui/react-progress"
import { motion } from "framer-motion"
import * as React from "react"

import { cn } from "@/lib/utils"

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  waveEffect?: boolean;
  waveColor?: string;
  waveOpacity?: number;
  waveWidth?: number;
  waveSpeed?: number;
};

function Progress({
  className,
  value,
  waveEffect = false,
  waveColor = "rgba(255, 255, 255, 0.2)",
  waveOpacity = 0.6,
  waveWidth = 24,
  waveSpeed = 3,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "glass bg-primary/20 relative h-2 w-full overflow-hidden rounded-full border border-border/30 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      <div className="relative w-full h-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="glass bg-primary/80 h-full w-full flex-1 transition-all relative overflow-hidden"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        >
          {waveEffect && value && value > 0 && (
            <motion.div 
              className="absolute top-0 left-0 h-full blur-sm rounded-full"
              style={{ 
                width: `${waveWidth}%`, 
                backgroundColor: waveColor,
                opacity: waveOpacity
              }}
              animate={{
                x: ['-100%', '200%'],
                opacity: [waveOpacity * 0.7, waveOpacity, waveOpacity * 0.7],
              }}
              transition={{ 
                duration: waveSpeed, 
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </ProgressPrimitive.Indicator>
      </div>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
