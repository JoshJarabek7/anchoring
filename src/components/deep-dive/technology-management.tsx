import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUIStore } from "@/stores/ui-store";
import { AnimatePresence, motion } from "framer-motion";
import { Code, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";

// Memoized component to prevent unnecessary rerenders
export const TechnologyManagement = memo(() => {
  const {
    versions,
    selectedTechnology,
    selectedVersion,
    deleteTechnology,
    deleteVersion,
  } = useTechnologyStore();
  const { toggleTechnologySelector } = useUIStore();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"tech" | "version">("tech");
  const [deleteId, setDeleteId] = useState("");
  const [deleteName, setDeleteName] = useState("");

  const handleDeleteClick = useCallback(
    (type: "tech" | "version", id: string, name: string) => {
      setDeleteType(type);
      setDeleteId(id);
      setDeleteName(name);
      setDeleteConfirmOpen(true);
    },
    []
  );

  const handleConfirmDelete = useCallback(async () => {
    if (deleteType === "tech") {
      await deleteTechnology(deleteId);
    } else {
      await deleteVersion(deleteId);
    }
    setDeleteConfirmOpen(false);
  }, [deleteType, deleteId, deleteTechnology, deleteVersion]);

  return (
    <>
      <div className="p-5 rounded-xl shadow-lg backdrop-blur-md border border-blue-800/30 bg-[#0a1e36]/90">
        <h2 className="text-xl font-semibold mb-4 text-blue-50 flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          Technology Management
        </h2>

        <div className="space-y-4">
          {/* Selected Technology */}
          <div>
            <h3 className="text-base font-medium mb-3 text-blue-200">
              Current Selection
            </h3>

            {selectedTechnology ? (
              <div className="flex flex-wrap gap-4">
                <motion.div
                  className="bg-[#0a2e4e]/90 p-4 rounded-xl flex-1 min-w-[250px] border border-blue-600/20 shadow-lg overflow-hidden"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-lg text-blue-50">
                        {selectedTechnology.name}
                      </h4>
                      {selectedTechnology.language && (
                        <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-200 rounded-full mt-2 inline-block">
                          {selectedTechnology.language}
                        </span>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 bg-[#0a3056]/70 hover:bg-red-900/30 rounded-lg"
                      onClick={() =>
                        handleDeleteClick(
                          "tech",
                          selectedTechnology.id,
                          selectedTechnology.name
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>

                  {/* Versions */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-blue-300/80">
                        Versions
                      </h5>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs shadow-sm rounded-lg"
                        onClick={() => toggleTechnologySelector()}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Version
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <AnimatePresence>
                        {versions
                          .filter(
                            (v) => v.technologyId === selectedTechnology.id
                          )
                          .map((version) => (
                            <motion.div
                              key={version.id}
                              className={cn(
                                `inline-flex items-center px-2 py-1 rounded-md text-xs font-medium`,
                                selectedVersion?.id === version.id
                                  ? "bg-blue-500/40 text-white shadow-md shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                                  : "bg-[#0d3658]/60 text-blue-200"
                              )}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{
                                type: "spring",
                                damping: 20,
                                stiffness: 300,
                              }}
                              layout
                            >
                              <span className="mr-1.5">{version.version}</span>
                              <button
                                className="text-blue-300/60 hover:text-red-400 transition-colors"
                                onClick={() =>
                                  handleDeleteClick(
                                    "version",
                                    version.id,
                                    version.version
                                  )
                                }
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </motion.div>
                          ))}
                      </AnimatePresence>

                      {(() => {
                        console.log(
                          "Debug versions:",
                          versions,
                          "selectedTechnology:",
                          selectedTechnology
                        );
                        return null;
                      })()}
                      {versions.filter(
                        (v) => v.technologyId === selectedTechnology.id
                      ).length === 0 && (
                        <motion.div
                          className="text-xs text-blue-400/60 italic p-1.5"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 }}
                        >
                          No versions added yet
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                <div className="bg-[#0a2e4e]/90 p-6 rounded-xl text-center shadow-md border border-blue-800/30">
                  <p className="text-blue-300/70 mb-4 text-base">
                    No technology selected
                  </p>
                  <Button
                    className="button-high-contrast shadow-lg px-4 py-1.5 h-auto text-sm rounded-lg"
                    onClick={toggleTechnologySelector}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Select or Create Technology
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#0a2642] rounded-xl shadow-xl p-5 border border-blue-900/40">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {deleteType === "tech" ? "Delete Technology" : "Delete Version"}
            </DialogTitle>
          </DialogHeader>

          <DialogDescription className="sr-only">
            Confirm deletion of{" "}
            {deleteType === "tech" ? "technology" : "version"}
          </DialogDescription>

          <div className="py-4">
            <p className="text-blue-50 text-base">
              Are you sure you want to delete
              <span className="font-semibold text-blue-100 mx-2">
                {deleteName}
              </span>
              {deleteType === "tech" &&
                "and all associated versions, URLs, and snippets"}
              ?
            </p>
            <p className="text-red-500 mt-3 font-medium text-sm">
              This action cannot be undone.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="bg-[#0a2e4e] px-4 rounded-lg text-sm"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="bg-red-500 hover:bg-red-600 px-4 rounded-lg text-sm"
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

TechnologyManagement.displayName = "TechnologyManagement";
