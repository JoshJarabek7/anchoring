import * as SwitchPrimitive from "@radix-ui/react-switch"
import * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "glass peer data-[state=checked]:bg-primary/80 data-[state=unchecked]:bg-input/40 focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/60 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent/50 shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "glass bg-background/90 dark:data-[state=unchecked]:bg-foreground/90 dark:data-[state=checked]:bg-primary-foreground/90 pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
