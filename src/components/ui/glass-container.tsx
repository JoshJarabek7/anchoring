import { cn } from '@/lib/utils';
import { cva, type VariantProps } from "class-variance-authority";
import { HTMLMotionProps, MotionProps, motion } from 'framer-motion';
import * as React from 'react';
import { ReactNode, forwardRef } from "react";

const glassContainerVariants = cva(
  "glass relative overflow-hidden",
  {
    variants: {
      depth: {
        surface: "glass-surface",
        deep: "glass-deep",
        abyss: "glass-abyss",
      },
      depthLevel: {
        1: "glass-depth-1",
        2: "glass-depth-2",
        3: "glass-depth-3",
      },
      rounded: {
        none: "rounded-none",
        sm: "rounded-sm",
        md: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
        "2xl": "rounded-2xl",
        "3xl": "rounded-3xl",
        full: "rounded-full",
        window: "rounded-[24px]", // Match window corner radius
        inherit: "", // Will use parent's border radius
      }
    },
    defaultVariants: {
      depth: "surface",
      depthLevel: 1,
      rounded: "lg"
    },
  }
);

export interface GlassContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassContainerVariants> {
  withNoise?: boolean;
  withCurrent?: boolean;
  withRipple?: boolean;
  withDepthStriations?: boolean;
  withHoverEffect?: boolean;
  animate?: boolean;
  motionProps?: HTMLMotionProps<"div">;
  children?: ReactNode;
}

export const GlassContainer = forwardRef<HTMLDivElement, GlassContainerProps>(
  ({
    className,
    depth,
    depthLevel,
    rounded,
    withNoise = false,
    withCurrent = false,
    withRipple = false,
    withDepthStriations = false,
    withHoverEffect = false,
    animate = false,
    children,
    ...props
  }, ref) => {
    const containerClasses = cn(
      glassContainerVariants({ depth, depthLevel, rounded }),
      withNoise && "glass-noise",
      withCurrent && "glass-current",
      withRipple && "glass-ripple",
      withDepthStriations && "glass-depth-striations",
      withHoverEffect && "hover:translate-y-[-2px] hover:shadow-lg transition-all duration-300",
      className
    );
    
    if (animate) {
      // Extract any motionProps from props and separate from other props
      const { motionProps, ...restProps } = props as { motionProps?: HTMLMotionProps<"div"> } & React.HTMLAttributes<HTMLDivElement>;
      
      const combinedMotionProps = {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: 10 },
          transition: { 
            type: "spring", 
            damping: 20, 
            stiffness: 300 
          },
          ...motionProps
        };
        
      // Explicitly type the motion props to avoid TypeScript errors
      // Cast motion props to fix type incompatibilities between React and Framer Motion events
      const typedMotionProps = combinedMotionProps as unknown as MotionProps;
      
      return (
        <motion.div
          ref={ref}
          className={containerClasses}
          {...(typedMotionProps as any)}
          {...restProps}
        >
          {children}
        </motion.div>
      );
    }
    
    return (
      <div
        ref={ref}
        className={containerClasses}
        {...props}
      >
        {children}
      </div>
    );
  }
);