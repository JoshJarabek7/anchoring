import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassContainer } from "@/components/ui/glass-container";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTechnologyStore } from "@/stores/technology-store";
import { useUIStore } from "@/stores/ui-store";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { DialogCloseButton } from "../app-header/dialog-close-button";

interface TechnologySelectorDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TechnologySelectorDialog({
  open,
  onOpenChange,
}: TechnologySelectorDialogProps) {
  const { technologySelectorOpen, setTechnologySelectorOpen } = useUIStore();

  const {
    technologies,
    versions,
    selectedTechnology,
    selectedVersion,
    selectTechnology,
    selectVersion,
    createTechnology,
    createVersion,
  } = useTechnologyStore();

  // State for searching technologies
  const [searchQuery, setSearchQuery] = useState("");

  // State for new tech/version creation
  const [showNewTechForm, setShowNewTechForm] = useState(false);
  const [showNewVersionForm, setShowNewVersionForm] = useState(false);
  const [newTechName, setNewTechName] = useState("");
  const [newTechLang, setNewTechLang] = useState("");
  const [newVersionNumber, setNewVersionNumber] = useState("");

  // Filter technologies based on search query
  const filteredTechnologies = technologies.filter((tech) =>
    tech.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle technology selection
  const handleTechSelect = useCallback(
    (techId: string) => {
      selectTechnology(techId);
    },
    [selectTechnology]
  );

  // Handle version selection
  const handleVersionSelect = useCallback(
    (versionId: string) => {
      selectVersion(versionId);
      if (onOpenChange) {
        onOpenChange(false);
      } else {
        setTechnologySelectorOpen(false);
      }
    },
    [selectVersion, setTechnologySelectorOpen, onOpenChange]
  );

  // Handle create technology
  const handleCreateTech = useCallback(async () => {
    if (newTechName.trim()) {
      await createTechnology(
        newTechName.trim(),
        newTechLang.trim() || undefined
      );
      setNewTechName("");
      setNewTechLang("");
      setShowNewTechForm(false);
    }
  }, [createTechnology, newTechName, newTechLang]);

  // Handle create version
  const handleCreateVersion = useCallback(async () => {
    console.log("handleCreateVersion called with:", {
      selectedTechnology: selectedTechnology?.name,
      techId: selectedTechnology?.id,
      newVersionNumber: newVersionNumber.trim(),
    });

    if (newVersionNumber.trim() && selectedTechnology) {
      try {
        await createVersion(selectedTechnology.id, newVersionNumber.trim());
        console.log("Version created successfully");
        setNewVersionNumber("");
        setShowNewVersionForm(false);
      } catch (error) {
        console.error("Error during version creation:", error);
      }
    } else {
      console.warn(
        "Cannot create version: missing technology or empty version number"
      );
    }
  }, [createVersion, newVersionNumber, selectedTechnology]);

  // Use provided open state if available, otherwise use store value
  const isOpen = open !== undefined ? open : technologySelectorOpen;

  // Use provided onOpenChange if available, otherwise use store setter
  const handleOpenChange = onOpenChange || setTechnologySelectorOpen;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] md:max-w-[800px] glass-abyss glass-bioluminescent dialog-content">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl">Select Technology</DialogTitle>
          <DialogCloseButton
            onClick={() => handleOpenChange(false)}
            className="dialog-close-button"
          />
        </DialogHeader>

        <DialogDescription className="sr-only">
          Select or create a technology and version to work with
        </DialogDescription>

        <div className="flex flex-col space-y-5">
          {/* Search and add technology */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/70" />
              <Input
                placeholder="Search technologies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 glass-input placeholder:text-foreground/70"
              />
            </div>

            <Button
              className="button-high-contrast"
              onClick={() => {
                setShowNewTechForm(true);
                setShowNewVersionForm(false);
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Technology
            </Button>
          </div>

          {/* New Technology Form */}
          <AnimatePresence>
            {showNewTechForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="overflow-visible"
              >
                <GlassContainer depth="deep" className="p-4" withNoise>
                  <h3 className="text-lg font-medium mb-4">
                    Add New Technology
                  </h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tech-name">Technology Name</Label>
                      <Input
                        id="tech-name"
                        value={newTechName}
                        onChange={(e) => setNewTechName(e.target.value)}
                        placeholder="e.g., React, Python, Node.js"
                        className="glass-input"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tech-lang">
                        Programming Language (optional)
                      </Label>
                      <Input
                        id="tech-lang"
                        value={newTechLang}
                        onChange={(e) => setNewTechLang(e.target.value)}
                        placeholder="e.g., JavaScript, Python, TypeScript"
                        className="glass-input"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowNewTechForm(false)}
                    >
                      Cancel
                    </Button>

                    <Button
                      className="button-high-contrast"
                      onClick={handleCreateTech}
                      disabled={!newTechName.trim()}
                    >
                      Create Technology
                    </Button>
                  </div>
                </GlassContainer>
              </motion.div>
            )}
          </AnimatePresence>

          {/* New Version Form */}
          <AnimatePresence>
            {showNewVersionForm && selectedTechnology && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="overflow-hidden"
              >
                <GlassContainer depth="deep" className="p-4" withNoise>
                  <h3 className="text-lg font-medium mb-4">
                    Add Version for {selectedTechnology.name}
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="version-number">Version Number</Label>
                    <Input
                      id="version-number"
                      value={newVersionNumber}
                      onChange={(e) => setNewVersionNumber(e.target.value)}
                      placeholder="e.g., 18.2.0, 4.2, 1.0"
                      className="glass-input"
                    />
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowNewVersionForm(false)}
                    >
                      Cancel
                    </Button>

                    <Button
                      className="button-high-contrast"
                      onClick={(e) => {
                        console.log("Create Version button clicked");
                        e.preventDefault();
                        handleCreateVersion();
                      }}
                      disabled={!newVersionNumber.trim()}
                    >
                      Create Version
                    </Button>
                  </div>
                </GlassContainer>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Technology list */}
          <div className="mt-4 mb-2 space-y-4">
            {filteredTechnologies.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No technologies found</p>
              </div>
            ) : (
              filteredTechnologies.map((tech) => (
                <GlassContainer
                  key={tech.id}
                  depth={
                    tech.id === selectedTechnology?.id ? "deep" : "surface"
                  }
                  depthLevel={tech.id === selectedTechnology?.id ? 2 : 1}
                  className={cn(
                    "p-4 rounded-lg transition-all duration-200 cursor-pointer",
                    tech.id === selectedTechnology?.id && "glass-bioluminescent"
                  )}
                  onClick={() => handleTechSelect(tech.id)}
                  withNoise
                >
                  {/* Technology content */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold">{tech.name}</h3>
                      {tech.language && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          {tech.language}
                        </div>
                      )}
                    </div>

                    {tech.id === selectedTechnology?.id && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="glass-surface"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewVersionForm(true);
                            setShowNewTechForm(false);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Version
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Show versions if this technology is selected */}
                  {tech.id === selectedTechnology?.id &&
                    versions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <p className="w-full text-sm text-muted-foreground mb-1">
                          Versions:
                        </p>
                        {versions.map((version) => (
                          <Button
                            key={version.id}
                            size="sm"
                            variant={
                              version.id === selectedVersion?.id
                                ? "default"
                                : "outline"
                            }
                            className={cn(
                              "text-xs",
                              version.id === selectedVersion?.id &&
                                "glass-current"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVersionSelect(version.id);
                            }}
                          >
                            {version.version}
                          </Button>
                        ))}
                      </div>
                    )}
                </GlassContainer>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
