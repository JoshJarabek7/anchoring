import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Only run theme check once mounted on client
  useEffect(() => {
    setIsMounted(true);
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
    setIsDark(!isDark);
  };
  
  // Handle initial theme setup based on system preference
  useEffect(() => {
    if (!isMounted) return;
    
    const savedTheme = localStorage.getItem("theme");
    
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else if (savedTheme === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else {
      // Check system preference
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      
      if (isSystemDark) {
        document.documentElement.classList.add("dark");
        setIsDark(true);
      }
    }
  }, [isMounted]);

  const springTransition = {
    type: "spring",
    stiffness: 700,
    damping: 30
  };

  // Don't render anything until mounted to avoid hydration mismatch
  if (!isMounted) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "relative overflow-hidden h-6 w-6 rounded-lg transition-all bg-white/50 dark:bg-[#0a3056]/70", 
        isDark ? "dark:shadow-[0_0_15px_rgba(56,189,248,0.3)]" : "hover:bg-amber-50/10",
        className
      )}
    >
      <div className="relative w-4 h-4">
        {/* Sun icon */}
        <motion.div
          initial={{ opacity: isDark ? 0 : 1, y: isDark ? 15 : 0, scale: isDark ? 0.5 : 1 }}
          animate={{ opacity: isDark ? 0 : 1, y: isDark ? 15 : 0, scale: isDark ? 0.5 : 1 }}
          transition={springTransition}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Sun className="h-4 w-4 text-amber-500" />
        </motion.div>
        
        {/* Moon icon */}
        <motion.div
          initial={{ opacity: isDark ? 1 : 0, y: isDark ? 0 : -15, scale: isDark ? 1 : 0.5 }}
          animate={{ opacity: isDark ? 1 : 0, y: isDark ? 0 : -15, scale: isDark ? 1 : 0.5 }}
          transition={springTransition}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Moon className="h-4 w-4 text-sky-400" />
        </motion.div>
        
        {/* Animated background glow for light/dark mode */}
        {isDark && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
          />
        )}
      </div>
    </Button>
  );
}