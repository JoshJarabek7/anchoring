import { cn } from "@/lib/utils";
import { motion, MotionProps } from "framer-motion";
import * as React from "react";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    withHoverEffect?: boolean;
    glassOptions?: {
      depth?: "surface" | "deep" | "abyss";
      depthLevel?: 1 | 2 | 3;
      withNoise?: boolean;
      withRipple?: boolean;
      withBioluminescence?: boolean;
    };
  }
>(
  (
    {
      className,
      withHoverEffect = false,
      glassOptions = {
        depth: "surface",
        depthLevel: 1,
        withNoise: false,
        withRipple: false,
        withBioluminescence: false,
      },
      ...props
    },
    ref
  ) => {
    const {
      depth = "surface",
      depthLevel = 1,
      withNoise = false,
      withRipple = false,
      withBioluminescence = false,
    } = glassOptions;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border bg-card text-card-foreground shadow-sm",
          `glass glass-${depth} glass-depth-${depthLevel}`,
          withNoise && "glass-noise",
          withRipple && "glass-ripple",
          withBioluminescence && "glass-bioluminescent",
          withHoverEffect &&
            "hover:translate-y-[-2px] hover:shadow-lg transition-all duration-300",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

// Animated Card with oceanic glassmorphism
const AnimatedGlassCard = React.forwardRef<
  HTMLDivElement,
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof MotionProps> & {
    withCaustics?: boolean;
    depth?: "surface" | "deep" | "abyss";
    depthLevel?: 1 | 2 | 3;
    withBioluminescence?: boolean;
    animationDelay?: number;
    children?: React.ReactNode;
  }
>(
  (
    {
      className,
      children,
      withCaustics = false,
      depth = "surface",
      depthLevel = 1,
      withBioluminescence = false,
      animationDelay = 0,
      ...props
    },
    ref
  ) => (
    <motion.div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        `glass glass-${depth} glass-depth-${depthLevel} glass-noise`,
        withBioluminescence && "glass-bioluminescent",
        "will-change-transform",
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        damping: 20,
        stiffness: 300,
        delay: animationDelay,
      }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      {...props}
    >
      {children}
    </motion.div>
  )
);
AnimatedGlassCard.displayName = "AnimatedGlassCard";

export {
  AnimatedGlassCard, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
};

