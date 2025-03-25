import { WaveProgress } from "@/components/ui/wave-progress";
import { useTaskStore } from "@/stores/task-store";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUIStore } from "@/stores/ui-store";
import { motion } from "framer-motion";
import { Activity, Book, Code, Database, Menu, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { TechnologySelectorDialog } from "../ui/technology-selector-dialog";
import { SettingsDialog } from "./settings-dialog";
import { TaskQueue } from "./task-queue";

export function AppHeader() {
  const { tasks } = useTaskStore();

  const { selectedTechnology, selectedVersion } = useTechnologyStore();

  const {
    taskQueueOpen,
    setTaskQueueOpen,
    settingsOpen,
    toggleSettings,
    setSettingsOpen,
    sidebarCollapsed,
    mobileModeActive,
    activeView,
    setActiveView,
    toggleTechnologySelector,
  } = useUIStore();

  const [activeTasks, setActiveTasks] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);

  useEffect(() => {
    // Calculate active tasks and their progress
    const runningTasks = tasks.filter(
      (task) => task.status.toLowerCase() === "running"
    );
    setActiveTasks(runningTasks.length);

    if (runningTasks.length > 0) {
      const avgProgress =
        runningTasks.reduce((sum, task) => sum + task.progress, 0) /
        runningTasks.length;
      setTotalProgress(avgProgress);
    } else {
      setTotalProgress(0);
    }
  }, [tasks]);

  const handleTechnologyMenuClick = () => {
    toggleTechnologySelector();
  };

  return (
    <>
      <div className="pointer-events-auto relative w-full max-w-7xl rounded-xl py-1.5 px-4 shadow-lg border border-white/10 will-change-transform bg-transparent">
        <div className="flex items-center justify-between h-12">
          {/* Side panel toggle for mobile/collapsed states */}
          <div className="flex items-center">
            {/* Hamburger menu for mobile */}
            {mobileModeActive ? (
              <button
                onClick={handleTechnologyMenuClick}
                className="sidebar-toggle flex items-center justify-center p-2 mr-3 rounded-md hover:bg-blue-900/30 transition-colors"
              >
                <Menu className="h-5 w-5 text-blue-200" />
              </button>
            ) : (
              // Toggle sidebar collapse for desktop
              <button
                onClick={handleTechnologyMenuClick}
                className={`sidebar-toggle flex items-center justify-center p-2 mr-3 rounded-md transition-colors ${
                  sidebarCollapsed ? "hover:bg-blue-900/30" : "bg-blue-900/20"
                }`}
              >
                <Menu className="h-5 w-5 text-blue-200" />
              </button>
            )}

            {/* App title */}
            <div className="flex items-center">
              <h1 className="text-xl font-bold !text-blue-50 tracking-tight">
                Anchoring
              </h1>
              {selectedTechnology && selectedVersion && (
                <motion.span
                  className="ml-3 text-sm !text-blue-300/80 flex items-center !bg-blue-900/30 px-2 py-0.5 rounded-md glass-depth-1"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <Code className="h-3.5 w-3.5 mr-1" />
                  {selectedTechnology.name}/{selectedVersion.version}
                </motion.span>
              )}
            </div>
          </div>

          {/* View selection tabs */}
          <div className="hidden md:flex items-center space-x-1.5 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-900/30 rounded-lg p-1 glass-depth-1">
            <motion.button
              onClick={() => setActiveView("deepDive")}
              className={`flex items-center px-3 py-1.5 rounded-md transition-all duration-300 ${
                activeView === "deepDive"
                  ? "!bg-blue-800/60 shadow-md  !text-blue-200 glass-bioluminescent font-medium"
                  : "!text-blue-300/80 !hover:bg-blue-600/10"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Database className="h-4 w-4 mr-1.5" />
              Deep Dive
            </motion.button>

            <motion.button
              onClick={() => setActiveView("knowledgeReef")}
              className={`flex items-center px-3 py-1.5 rounded-md transition-all duration-300 ${
                activeView === "knowledgeReef"
                  ? "!bg-blue-800/60 shadow-md !text-blue-200 glass-bioluminescent font-medium"
                  : "!text-blue-300/80 !hover:bg-blue-600/10"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Book className="h-4 w-4 mr-1.5" />
              Knowledge Reef
            </motion.button>
          </div>

          {/* Right side controls */}
          <div className="flex items-center space-x-1">
            {/* Task queue button with wave animation when tasks are active */}
            <motion.button
              className={`flex items-center justify-center rounded-md relative overflow-hidden ${
                taskQueueOpen ? "bg-blue-900/30" : ""
              }  !hover:bg-blue-900/20 transition-colors p-2`}
              onClick={() => setTaskQueueOpen(!taskQueueOpen)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Activity className="h-5 w-5  !text-blue-200" />

              {/* Task count badge */}
              {tasks.length > 0 && (
                <div className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
                  <span className="flex items-center justify-center !bg-blue-400 !text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1">
                    {tasks.length}
                  </span>
                </div>
              )}

              {/* Wave animation for task progress */}
              {activeTasks > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5">
                  <WaveProgress value={totalProgress} showWaveEffect={true} />
                </div>
              )}
            </motion.button>

            {/* Settings button */}
            <motion.button
              className={`flex items-center justify-center rounded-md ${
                settingsOpen ? "!bg-blue-900/30" : ""
              } !hover:bg-blue-900/20 transition-colors p-2`}
              onClick={toggleSettings}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Settings className="h-5 w-5 !text-blue-200" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Task Queue Dialog - using Functional Component from app-header/task-queue.tsx */}
      <TaskQueue />

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Technology Selector Dialog */}
      <TechnologySelectorDialog />
    </>
  );
}
