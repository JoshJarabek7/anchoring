import { useEffect, useState } from "react";
import { toast } from "sonner";
// Import fs plugin dynamically to prevent CORS issues during development
// import { exists } from "@tauri-apps/plugin-fs";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getUserSettings } from "./lib/db";

// Import pages
import SessionsPage from "./components/sessions/SessionsPage";
import SettingsPage from "./components/settings/SettingsPage";
import { CrawlSession, CrawlSettings } from "./lib/db";
import CrawlerForm from "./components/crawler/CrawlerForm";
import UrlInput from "./components/crawler/UrlInput";
import URLList from "./components/crawler/URLList";
import AiProcessing from "./components/crawler/AiProcessing";

// Setup screen component
const SetupScreen = ({ onSetup }: { onSetup: (path: string) => void }) => {
  const [chromaPath, setChromaPath] = useState("");
  const [validating, setValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [initializingDb, setInitializingDb] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    try {
      // Dynamically import the fs plugin to avoid CORS issues
      const fsPlugin = await import("@tauri-apps/plugin-fs");
      // Check if path exists using fs plugin
      const pathExists = await fsPlugin.exists(chromaPath);
      setIsValid(pathExists);
      
      if (pathExists) {
        setInitializingDb(true);
        // Initialize our database (this will be done on the React side)
        const { initDB } = await import("./lib/db");
        await initDB();
        setInitializingDb(false);
        onSetup(chromaPath);
      }
    } catch (error) {
      console.error("Error validating ChromaDB path:", error);
      setIsValid(false);
      
      // Provide more specific error messages
      if (String(error).includes("forbidden path")) {
        toast.error(
          "Path access denied. This path is not allowed by Tauri security settings. Please choose a different location or contact support.",
          { duration: 5000 }
        );
      } else {
        toast.error("Failed to validate path. Make sure Tauri is running properly.");
      }
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-[450px]">
        <CardHeader>
          <CardTitle>Welcome to Anchoring</CardTitle>
          <CardDescription>
            Please set up your ChromaDB path to get started.
            This should match the path used by the MCP server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chroma-path">ChromaDB Path</Label>
              <Input
                id="chroma-path"
                placeholder="/path/to/your/chroma/directory"
                value={chromaPath}
                onChange={(e) => setChromaPath(e.target.value)}
              />
            </div>
            
            {isValid === false && (
              <div className="text-sm text-red-500">
                The specified path does not exist. Please enter a valid directory path.
              </div>
            )}
            
            {initializingDb && (
              <div className="space-y-2">
                <div className="text-sm">Initializing database...</div>
                <Progress value={50} className="w-full" />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleValidate}
            disabled={!chromaPath || validating || initializingDb}
            className="w-full"
          >
            {validating ? "Validating..." : "Set Up Anchoring"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// Crawler page component
const CrawlerPage = ({ sessionId }: { sessionId: number | null }) => {
  const [settings, setSettings] = useState<CrawlSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [activeCrawlUrls, setActiveCrawlUrls] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Fetch crawler settings when the component loads or sessionId changes
  useEffect(() => {
    if (sessionId === null) return;
    
    const loadSettings = async () => {
      try {
        setLoading(true);
        // Import and use getCrawlSettings
        const { getCrawlSettings } = await import("./lib/db");
        const settings = await getCrawlSettings(sessionId);
        setSettings(settings);
      } catch (error) {
        console.error("Failed to load crawler settings:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, [sessionId]);
  
  // Poll for active crawling status
  useEffect(() => {
    if (!crawling) return;
    
    const intervalId = setInterval(async () => {
      try {
        const { getCrawlingStatus } = await import("./lib/crawler");
        const status = getCrawlingStatus();
        
        // Update UI with current crawling status
        setCrawling(status.isCrawling);
        setActiveCrawlUrls(status.activeCrawlUrls);
        
        // If crawling is no longer active, trigger URL refresh
        if (!status.isCrawling && crawling) {
          setRefreshTrigger(prev => prev + 1);
          toast.success("Crawling completed!");
        }
      } catch (error) {
        console.error("Error checking crawler status:", error);
      }
    }, 1000);
    
    return () => clearInterval(intervalId);
  }, [crawling]);
  
  const handleStartCrawling = async (selectedUrls: string[]) => {
    if (!settings) {
      toast.error("Crawler settings not loaded. Please save settings first.");
      return;
    }
    
    if (selectedUrls.length === 0) {
      toast.error("No URLs selected for crawling.");
      return;
    }
    
    try {
      setCrawling(true);
      toast.info(`Starting crawler for ${selectedUrls.length} URLs...`);
      
      // Import the startCrawler function
      const { startCrawler } = await import("./lib/crawler");
      
      // Start crawling for each selected URL
      for (const url of selectedUrls) {
        await startCrawler({
          startUrl: url,
          prefixPath: settings.prefix_path || "",
          antiPaths: (settings.anti_paths || "").split(",").filter(Boolean).map(path => path.trim()),
          antiKeywords: (settings.anti_keywords || "").split(",").filter(Boolean).map(keyword => keyword.trim()),
          sessionId: sessionId as number
        });
      }
      
      // Note: No toast here because now we detect completion in the useEffect
    } catch (error) {
      console.error("Error during crawling:", error);
      toast.error("An error occurred during crawling. Check console for details.");
      setCrawling(false);
    }
  };
  
  const handleStopCrawling = async () => {
    try {
      const { stopCrawling } = await import("./lib/crawler");
      stopCrawling();
      toast.info("Stopping crawler. Currently processing URLs will complete...");
    } catch (error) {
      console.error("Error stopping crawler:", error);
      toast.error("Failed to stop crawler");
    }
  };
  
  const handleUrlAdded = async (url: string) => {
    if (!sessionId) return;
    
    try {
      // Add URL to the database
      const { addURL } = await import("./lib/db");
      await addURL({
        session_id: sessionId,
        url,
        status: 'pending'
      });
      
      // Signal refresh - use a smaller value for incremental refresh
      setRefreshTrigger(prev => prev + 0.1);
      
      toast.success("URL added successfully");
    } catch (error) {
      console.error("Error adding URL:", error);
      toast.error("Failed to add URL. Please try again.");
    }
  };
  
  if (sessionId === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Web Crawler</CardTitle>
          <CardDescription>Configure and start web crawling.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Select a session first to configure the crawler.</p>
        </CardContent>
      </Card>
    );
  }
  
  const handleSettingsSaved = (newSettings: CrawlSettings) => {
    setSettings(newSettings);
    toast.success("Crawler settings saved successfully!");
  };
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Web Crawler</CardTitle>
          <CardDescription>Loading crawler settings...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Web Crawler</CardTitle>
          <CardDescription>Configure and start web crawling for session #{sessionId}.</CardDescription>
        </CardHeader>
        <CardContent>
          <CrawlerForm 
            sessionId={sessionId} 
            existingSettings={settings || undefined}
            onSettingsSaved={handleSettingsSaved}
          />
        </CardContent>
      </Card>
      
      {settings && (
        <>
          {crawling && (
            <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Crawling in Progress</span>
                  <Button 
                    variant="destructive" 
                    onClick={handleStopCrawling}
                    className="ml-2"
                  >
                    Stop Crawling
                  </Button>
                </CardTitle>
                <CardDescription>
                  {activeCrawlUrls.length > 0 
                    ? `Currently crawling: ${activeCrawlUrls.join(', ')}` 
                    : 'Processing...'
                  }
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Add Starting URL</CardTitle>
              <CardDescription>Add a URL to start crawling from</CardDescription>
            </CardHeader>
            <CardContent>
              <UrlInput 
                sessionId={sessionId as number}
                prefixPath={settings.prefix_path}
                antiPaths={(settings.anti_paths || "").split(",").filter(Boolean).map(path => path.trim())}
                antiKeywords={(settings.anti_keywords || "").split(",").filter(Boolean).map(keyword => keyword.trim())}
                onUrlAdded={handleUrlAdded}
                disabled={crawling}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>URL Management</CardTitle>
              <CardDescription>Manage and start crawling URLs</CardDescription>
            </CardHeader>
            <CardContent>
              <URLList 
                sessionId={sessionId as number}
                onStartCrawling={handleStartCrawling}
                refreshTrigger={refreshTrigger}
                isCrawling={crawling}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

// Main application component
const MainApp = ({ chromaPath }: { chromaPath: string }) => {
  const [activeTab, setActiveTab] = useState("sessions");
  const [activeSession, setActiveSession] = useState<CrawlSession | null>(null);
  const [apiKey, setApiKey] = useState("");
  
  // Add a function to clear toasts when changing tabs
  const handleTabChange = (value: string) => {
    // Clear any lingering toasts
    for (let i = 1; i <= 20; i++) {
      toast.dismiss(`chunk-${i}`);
      toast.dismiss(`processing-${i}`);
    }
    toast.dismiss("markdown-processing");
    
    // Set the active tab
    setActiveTab(value);
  };
  
  const handleSelectSession = (session: CrawlSession) => {
    setActiveSession(session);
    setActiveTab("crawler");
  };
  
  // Load OpenAI API key
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const settings = await getUserSettings();
        if (settings.openai_key) {
          setApiKey(settings.openai_key);
        }
      } catch (error) {
        console.error("Failed to load API key:", error);
      }
    };
    
    loadApiKey();
  }, []);

  return (
    <div className="container mx-auto py-4 space-y-4">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Anchoring</h1>
        <div className="text-sm text-muted-foreground">
          Session: {activeSession ? `${activeSession.title}${activeSession.version ? ` V${activeSession.version}` : ""}` : "None"} | ChromaDB: {chromaPath ? chromaPath.split("/").pop() : "Not Set"}
        </div>
      </header>
      
      <Tabs 
        defaultValue="sessions" 
        value={activeTab} 
        onValueChange={handleTabChange} 
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="crawler">Crawler</TabsTrigger>
          <TabsTrigger value="processing">AI Processing</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="sessions">
          <SessionsPage 
            chromaPath={chromaPath} 
            onSelectSession={handleSelectSession}
          />
        </TabsContent>
        
        <TabsContent value="crawler">
          <CrawlerPage sessionId={activeSession?.id || null} />
        </TabsContent>
        
        <TabsContent value="processing">
          <AiProcessing 
            sessionId={activeSession?.id || 0} 
            chromaPath={chromaPath}
            apiKey={apiKey}
          />
        </TabsContent>
        
        <TabsContent value="settings">
          <SettingsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
};

function App() {
  const [isSetup, setIsSetup] = useState(false);
  const [chromaPath, setChromaPath] = useState("");
  const [loading, setLoading] = useState(true);

  // Check if we already have settings with ChromaDB path
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        
        // Initialize the database first
        const { initDB } = await import("./lib/db");
        await initDB();
        
        // Then check for existing settings
        const settings = await getUserSettings();
        
        if (settings.chroma_path) {
          // We already have settings, check if path exists
          const fsPlugin = await import("@tauri-apps/plugin-fs");
          const pathExists = await fsPlugin.exists(settings.chroma_path);
          
          if (pathExists) {
            // We can skip setup screen
            console.log("Found valid ChromaDB path in settings:", settings.chroma_path);
            setChromaPath(settings.chroma_path);
            setIsSetup(true);
            toast.success("Loaded existing ChromaDB path from settings");
          } else {
            console.log("ChromaDB path exists in settings but directory not found:", settings.chroma_path);
          }
        } else {
          console.log("No ChromaDB path found in settings");
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, []);

  const handleSetup = async (path: string) => {
    try {
      // Also save the path to user settings
      const { saveUserSettings } = await import("./lib/db");
      await saveUserSettings({ chroma_path: path });
      
      setChromaPath(path);
      setIsSetup(true);
    } catch (error) {
      console.error("Failed to save ChromaDB path:", error);
      toast.error("Failed to save ChromaDB path. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-medium">Loading Anchoring...</h2>
          <Progress value={50} className="w-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      {!isSetup ? (
        <SetupScreen onSetup={handleSetup} />
      ) : (
        <MainApp chromaPath={chromaPath} />
      )}
    </>
  );
}

export default App;