import { ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";

interface ThemeProviderWrapperProps {
  children: ReactNode;
  defaultTheme?: "light" | "dark" | "system";
  storageKey?: string;
}

// This wrapper component avoids the direct use of refs
export function ThemeProviderWrapper({
  children,
  defaultTheme = "system",
  storageKey = "anchoring-theme",
}: ThemeProviderWrapperProps) {
  return (
    <ThemeProvider defaultTheme={defaultTheme} storageKey={storageKey}>
      {children}
    </ThemeProvider>
  );
}