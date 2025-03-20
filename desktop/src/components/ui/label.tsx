import { cn } from "@/lib/utils"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      glassStyle: {
        none: "",
        default: "glass-label",
      },
      depth: {
        none: "",
        surface: "glass-surface inline-block px-2 py-1 rounded-md",
        deep: "glass-deep inline-block px-2 py-1 rounded-md",
      }
    },
    defaultVariants: {
      glassStyle: "none",
      depth: "none",
    },
  }
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, glassStyle, depth, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ glassStyle, depth, className }))}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
