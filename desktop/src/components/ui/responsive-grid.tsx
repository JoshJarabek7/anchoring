import React from "react";
import { cn } from "@/lib/utils";

interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    "2xl"?: number;
  };
  gap?: string;
}

/**
 * A responsive grid component that adapts its columns based on screen size
 */
export function ResponsiveGrid({
  children,
  columns = { sm: 1, md: 2, lg: 3, xl: 4, "2xl": 4 },
  gap = "4",
  className,
  ...props
}: ResponsiveGridProps) {
  // Generate column class names for different breakpoints
  const columnClasses = [
    columns.sm && `grid-cols-${columns.sm}`,
    columns.md && `md:grid-cols-${columns.md}`,
    columns.lg && `lg:grid-cols-${columns.lg}`,
    columns.xl && `xl:grid-cols-${columns.xl}`,
    columns["2xl"] && `2xl:grid-cols-${columns["2xl"]}`,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "grid",
        `gap-${gap}`,
        ...columnClasses,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default ResponsiveGrid;