import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import * as React from "react"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  glassStyling?: boolean
  depth?: "surface" | "deep" | "abyss"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, glassStyling = true, depth = "surface", ...props }, ref) => {
    // State to track focus for animation
    const [isFocused, setIsFocused] = React.useState(false)
    
    return (
      <div className="relative">
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground/70 focus-visible:outline-none focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 box-border",
            glassStyling && "glass-input",
            glassStyling && `glass-${depth}`,
            className
          )}
          ref={ref}
          onFocus={(e) => {
            setIsFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            props.onBlur?.(e)
          }}
          {...props}
        />
        
        {/* Animated focus effect */}
        {glassStyling && isFocused && (
          <motion.div 
            className="absolute inset-0 pointer-events-none rounded-md overflow-hidden"
            initial={{ opacity: 0, boxShadow: "0 0 0 0 rgba(80, 160, 255, 0)" }}
            animate={{ 
              opacity: 1, 
              boxShadow: "0 0 10px 1px rgba(80, 160, 255, 0.2), 0 0 20px 4px rgba(80, 160, 255, 0.1)" 
            }}
            exit={{ opacity: 0, boxShadow: "0 0 0 0 rgba(80, 160, 255, 0)" }}
            transition={{ duration: 0.2 }}
          />
        )}
        
        {/* Caustics effect on focus */}
        {glassStyling && isFocused && (
          <motion.div 
            className="absolute inset-0 pointer-events-none overflow-hidden rounded-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-blue-400/10 via-teal-400/5 to-blue-400/10 rounded-md"
              style={{ backgroundSize: "200% 100%" }}
              animate={{
                backgroundPosition: ["0% 0%", "100% 0%"],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            />
          </motion.div>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

export { Input }
