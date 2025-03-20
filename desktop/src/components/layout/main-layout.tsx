import { motion } from 'framer-motion';
import { ReactNode, memo } from 'react';

interface MainLayoutProps {
  children: ReactNode;
}

// Memoized layout component to reduce re-renders
export const MainLayout = memo(({ children }: MainLayoutProps) => {
  return (
    <main className="flex w-full min-h-screen overflow-hidden bg-transparent will-change-transform">
      {/* Main content area */}
      <motion.div 
        className="flex-1 bg-transparent overflow-auto will-change-transform overflow-fade-bottom"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 150, 
          damping: 20,
          duration: 0.4 
        }}
        style={{ height: '100vh' }}
      >
        <div className="rounded-xl min-h-[calc(100vh-4.5rem)] bg-transparent px-6 pt-2 pb-8">
          {children}
        </div>
      </motion.div>
    </main>
  );
});

MainLayout.displayName = "MainLayout";