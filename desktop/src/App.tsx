import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { AppHeader } from "./components/app-header";
import { MainLayout } from "./components/layout/main-layout";
import { setupEventListeners } from "./lib/event-handlers";
import { initializeWorker, workerService } from "./lib/worker-service";
import { useTaskStore } from "./stores/task-store";
import { useTechnologyStore } from "./stores/technology-store";
import { useUIStore } from "./stores/ui-store";
import { DeepDiveView } from "./views/deep-dive-view";
import { KnowledgeReefView } from "./views/knowledge-reef-view";

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
      // Initialize worker first
      initializeWorker();
      initializeApp();
    }

    // Clean up worker when app unmounts
    return () => {
      console.log("Terminating worker...");
      workerService.terminate();
    };
  }, [initialized, initializeApp]);

  return (
    <>
      {/* Main app container */}
      <div className="flex flex-col relative overflow-hidden bg-transparent w-screen h-screen hw-accelerated app-root">
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
