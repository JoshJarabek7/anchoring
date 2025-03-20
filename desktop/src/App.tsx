import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { AppHeader } from "./components/app-header";
import { MainLayout } from "./components/layout/main-layout";
import { setupEventListeners } from "./lib/event-handlers";
import { useTaskStore } from "./stores/task-store";
import { useTechnologyStore } from "./stores/technology-store";
import { useUIStore } from "./stores/ui-store";
import { DeepDiveView } from "./views/deep-dive-view";
import { KnowledgeReefView } from "./views/knowledge-reef-view";

// Separate memoized component for underwater particles to prevent rerenders
const UnderwaterParticles = React.memo(() => {
  // Generate particles once to avoid recalculation on re-renders
  const particles = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      key: `particle-${i}`,
      class: `particle particle-${i % 4}`,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      width: `${2 + Math.random() * 2}px`,
      height: `${2 + Math.random() * 2}px`,
      animationDelay: `${Math.random() * 30}s`,
      animationDuration: `${60 + Math.random() * 40}s`,
      opacity: (0.2 + Math.random() * 0.3).toString(),
      distance: (
        (Math.random() > 0.5 ? 1 : -1) *
        (40 + Math.random() * 120)
      ).toString(),
    }));
  }, []);

  return (
    <div className="underwater-particles">
      {particles.map((particle) => (
        <div
          key={particle.key}
          className={particle.class}
          style={
            {
              left: particle.left,
              top: particle.top,
              width: particle.width,
              height: particle.height,
              animationDelay: particle.animationDelay,
              animationDuration: particle.animationDuration,
              "--particle-opacity": particle.opacity,
              "--particle-distance": particle.distance,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});

// Separate memoized component for background elements to prevent rerenders
const BackgroundElements = React.memo(() => {
  return (
    <div className="background-layers">
      <div className="app-background">
        <UnderwaterParticles />
      </div>
      <div className="water-pattern" />
    </div>
  );
});

function App() {
  const [initialized, setInitialized] = useState(false);
  const { fetchTechnologies } = useTechnologyStore();
  const { initializeTasks } = useTaskStore();
  const { activeView } = useUIStore();

  // Memoize the initialization function to prevent unnecessary rerenders
  const initializeApp = useMemo(
    () => async () => {
      // Setup event listeners for Tauri events
      setupEventListeners();

      // Fetch initial data
      await fetchTechnologies();
      await initializeTasks();

      setInitialized(true);
    },
    [fetchTechnologies, initializeTasks]
  );

  // Initialize the app
  useEffect(() => {
    if (!initialized) {
      initializeApp();
    }
  }, [initialized, initializeApp]);

  return (
    <>
      {/* Oceanic background - now in an isolated component outside the main app tree */}
      <BackgroundElements />

      {/* Main app container */}
      <div className="flex flex-col relative overflow-hidden bg-transparent w-screen h-screen hw-accelerated">
        {/* Header - positioned with proper z-index */}
        <div className="relative z-50 flex justify-center items-center pt-4 px-4">
          <AppHeader />
        </div>

        {/* Main Content */}
        <div className="flex-1 relative bg-transparent">
          <AnimatePresence mode="wait">
            <MainLayout key="main-layout">
              <AnimatePresence mode="wait">
                {activeView === "deepDive" && (
                  <motion.div
                    key="deep-dive-view"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{
                      type: "spring",
                      stiffness: 120,
                      damping: 15,
                      duration: 0.4,
                    }}
                    className="will-change-transform"
                  >
                    <DeepDiveView />
                  </motion.div>
                )}

                {activeView === "knowledgeReef" && (
                  <motion.div
                    key="knowledge-reef-view"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{
                      type: "spring",
                      stiffness: 120,
                      damping: 15,
                      duration: 0.4,
                    }}
                    className="will-change-transform"
                  >
                    <KnowledgeReefView />
                  </motion.div>
                )}
              </AnimatePresence>
            </MainLayout>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

export default App;
