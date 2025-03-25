import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassContainer } from "@/components/ui/glass-container";
import { TaskCard } from "@/components/ui/task-card";
import { Task, useTaskStore } from "@/stores/task-store";
import { useUIStore } from "@/stores/ui-store";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import React, { useCallback, useState } from "react";

export const TaskQueue = React.memo(() => {
  const { tasks } = useTaskStore();
  const { taskQueueOpen, setTaskQueueOpen } = useUIStore();

  // Add pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Always sort by progress and status priority
  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Sort by status priority (running > queued > completed > failed)
      const getStatusPriority = (status: string): number => {
        switch (status.toLowerCase()) {
          case "running":
            return 0;
          case "queued":
            return 1;
          case "completed":
            return 2;
          case "failed":
            return 3;
          case "cancelled":
            return 4;
          default:
            return 5;
        }
      };

      const statusPriorityA = getStatusPriority(a.status);
      const statusPriorityB = getStatusPriority(b.status);

      // First compare by status priority
      if (statusPriorityA !== statusPriorityB) {
        return statusPriorityA - statusPriorityB;
      }

      // Then by progress (higher progress first)
      return b.progress - a.progress;
    });
  }, [tasks]);

  // Paginate tasks
  const paginatedTasks = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedTasks.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedTasks, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage);

  // Change page
  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(Math.min(Math.max(1, newPage), totalPages || 1));
    },
    [totalPages]
  );

  // Adjust items per page
  const handleItemsPerPageChange = useCallback((items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  const handleCancel = useCallback((taskId: string) => {
    useTaskStore.getState().cancelTask(taskId);
  }, []);

  const handleCloseTaskQueue = useCallback(
    () => setTaskQueueOpen(false),
    [setTaskQueueOpen]
  );

  // Memoized task item component to reduce re-renders
  const TaskItem = useCallback(
    ({ task }: { task: Task }) => (
      <TaskCard
        key={`${task.id}-${task.status}-${task.progress}`}
        id={task.id}
        title={getTaskTitle(task)}
        progress={task.progress}
        status={task.status.toLowerCase() as any}
        stages={task.stages || []}
        created={task.createdDate}
        onCancel={() => handleCancel(task.id)}
      />
    ),
    [handleCancel]
  );

  return (
    <Dialog open={taskQueueOpen} onOpenChange={setTaskQueueOpen}>
      <DialogContent className="glass-abyss sm:max-w-[500px] md:max-w-[700px] dialog-content">
        <DialogHeader className="flex-row items-center justify-between px-1">
          <DialogTitle className="text-lg flex items-center gap-2 text-foreground">
            Task Queue
            {tasks.length > 0 && (
              <span className="bg-primary/20 glass-depth-1 px-2 py-0.5 rounded-md text-sm text-foreground/90">
                {tasks.length} active
              </span>
            )}
          </DialogTitle>

          <div className="flex items-center gap-2">
            <DialogPrimitive.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-foreground dialog-close-button"
                onClick={handleCloseTaskQueue}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Trigger>
          </div>
        </DialogHeader>

        <DialogDescription className="sr-only">
          View and manage background tasks
        </DialogDescription>

        <div className="flex-1 py-2 px-1">
          {tasks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassContainer
                depth="surface"
                className="py-8 flex flex-col items-center justify-center"
              >
                <p className="text-foreground">No active tasks</p>
                <p className="text-sm text-foreground/80 mt-1">
                  Tasks will appear here when processing starts
                </p>
              </GlassContainer>
            </motion.div>
          ) : (
            <>
              <div className="space-y-2">
                {paginatedTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>

              {/* Pagination controls */}
              {sortedTasks.length > itemsPerPage && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-muted text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Show</span>
                    <select
                      className="glass-surface p-1 rounded text-xs"
                      value={itemsPerPage}
                      onChange={(e) =>
                        handleItemsPerPageChange(Number(e.target.value))
                      }
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <span className="sr-only">Previous page</span>
                      <span>‹</span>
                    </Button>
                    <span className="text-xs text-muted-foreground px-1">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <span className="sr-only">Next page</span>
                      <span>›</span>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

TaskQueue.displayName = "TaskQueue";

function getTaskTitle(task: Task): string {
  switch (task.taskType) {
    case "crawl_url":
      return `Crawling: ${truncateMiddle(task.payload?.url || "URL", 30)}`;
    case "clean_markdown":
      return "Cleaning Markdown";
    case "generate_snippets":
      return "Generating Snippets";
    case "search_embeddings":
      return "Searching Documentation";
    case "apply_url_filters":
      return `Filtering URLs: ${truncateMiddle(task.payload?.url || "", 30)}`;
    default:
      return task.taskType;
  }
}

function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const ellipsis = "...";
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return (
    str.substring(0, frontChars) +
    ellipsis +
    str.substring(str.length - backChars)
  );
}
