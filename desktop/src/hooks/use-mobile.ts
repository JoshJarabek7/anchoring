import * as React from "react";

interface UseIsMobileOptions {
  breakpoint?: number;
  onBreakpoint?: (isMobile: boolean) => void;
}

const DEFAULT_MOBILE_BREAKPOINT = 768

export function useIsMobile(options?: UseIsMobileOptions) {
  const breakpoint = options?.breakpoint || DEFAULT_MOBILE_BREAKPOINT;
  const onBreakpoint = options?.onBreakpoint;
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)
  const prevMobileState = React.useRef<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      const mobileState = window.innerWidth < breakpoint;
      setIsMobile(mobileState);
      
      // Only call onBreakpoint if the state actually changed
      if (onBreakpoint && prevMobileState.current !== mobileState) {
        prevMobileState.current = mobileState;
        onBreakpoint(mobileState);
      }
    }
    mql.addEventListener("change", onChange)
    
    // Initial check
    const initialMobileState = window.innerWidth < breakpoint;
    setIsMobile(initialMobileState);
    
    // Only call onBreakpoint on initial mount or if state changed
    if (onBreakpoint && prevMobileState.current !== initialMobileState) {
      prevMobileState.current = initialMobileState;
      onBreakpoint(initialMobileState);
    }
    
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint, onBreakpoint])

  return !!isMobile
}
