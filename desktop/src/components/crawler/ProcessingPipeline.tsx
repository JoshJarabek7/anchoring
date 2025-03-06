import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { ProcessingStatus, DocumentSource, processBatch, TechDetails } from "@/lib/pipeline";
import { MarkdownCleanupValues } from "@/types/forms";
import { DocumentationCategory, FullDocumentationSnippet } from "@/lib/db";
import { ChromaClient } from "@/lib/chroma-client";
import ProcessingOptions from "./ProcessingOptions";

interface ProcessingPipelineProps {
  urls: { id: number; url: string; html?: string }[];
  apiKey: string;
  chromaPath: string;
  sessionId: number;
  category: DocumentationCategory;
  language?: string;
  languageVersion?: string;
  framework?: string;
  frameworkVersion?: string;
  library?: string;
  libraryVersion?: string;
  onComplete: (results: { url: string; snippets: FullDocumentationSnippet[] }[]) => void;
  onCancel: () => void;
}

export default function ProcessingPipeline({
  urls,
  apiKey,
  chromaPath,
  // sessionId, - Not used yet
  category,
  language,
  languageVersion,
  framework,
  frameworkVersion,
  library,
  libraryVersion,
  onComplete,
  onCancel
}: ProcessingPipelineProps) {
  const [showOptions, setShowOptions] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const processingCancelRef = useRef(false);

  // Cleanup effect to dismiss any lingering toast notifications when the component unmounts
  useEffect(() => {
    return () => {
      // Dismiss any chunking toasts on unmount
      for (let i = 1; i <= 20; i++) {
        toast.dismiss(`chunk-${i}`);
        toast.dismiss(`processing-${i}`);
      }
      
      // Dismiss other possible toast ids
      toast.dismiss("markdown-processing");
    };
  }, []);

  // Log the tech details when component mounts or props change
  useEffect(() => {
    console.log("ProcessingPipeline - Tech Details:");
    console.log(`Category: ${category}`);
    console.log(`Language: ${language}, Version: ${languageVersion}`);
    console.log(`Framework: ${framework}, Version: ${frameworkVersion}`);
    console.log(`Library: ${library}, Version: ${libraryVersion}`);
  }, [category, language, languageVersion, framework, frameworkVersion, library, libraryVersion]);

  const getStatusText = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.CONVERTING:
        return "Converting HTML to Markdown";
      case ProcessingStatus.CLEANING:
        return "Cleaning up Markdown with AI";
      case ProcessingStatus.CHUNKING:
        return "Processing into document snippets";
      case ProcessingStatus.EMBEDDING:
        return "Embedding and storing in ChromaDB";
      case ProcessingStatus.COMPLETE:
        return "Processing complete";
      case ProcessingStatus.ERROR:
        return "Error during processing";
      default:
        return "Waiting to start";
    }
  };

  const handleStartProcessing = async (options: MarkdownCleanupValues) => {
    console.log("================================");
    console.log("STARTING PROCESSING PIPELINE");
    console.log("================================");
    console.log("Processing options:", options);
    console.log("URLs to process:", urls.length);

    if (!apiKey) {
      console.error("ERROR: No OpenAI API key provided");
      toast.error("OpenAI API key is required");
      return;
    }

    // Filter URLs that have HTML content
    const sourcesToProcess: DocumentSource[] = urls
      .filter(url => url.html)
      .map(url => ({
        url: url.url,
        html: url.html!,
        id: url.id
      }));

    console.log(`Found ${sourcesToProcess.length} URLs with HTML content to process`);
    console.log("URLs to process:", sourcesToProcess.map(s => s.url));

    if (sourcesToProcess.length === 0) {
      console.error("ERROR: No URLs with HTML content to process");
      toast.error("No URLs with HTML content to process");
      return;
    }

    try {
      console.log("Hiding options and starting processing");
      setShowOptions(false);
      setProcessing(true);

      // Make sure we have required values
      if (!chromaPath) {
        console.error("ERROR: No ChromaDB path provided");
        toast.error("ChromaDB path is required");
        setProcessing(false);
        return;
      }
      
      if (!apiKey) {
        console.error("ERROR: No OpenAI API key provided");
        toast.error("OpenAI API key is required");
        setProcessing(false);
        return;
      }
      
      console.log("ChromaDB path:", chromaPath);
      console.log("OpenAI API key (truncated):", `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
      
      // First verify the ChromaDB path exists
      try {
        console.log("Checking if ChromaDB path exists:", chromaPath);
        const exists = await (window as any).__TAURI__.fs.exists(chromaPath);
        if (!exists) {
          console.error(`ERROR: ChromaDB path does not exist: ${chromaPath}`);
          toast.error(`ChromaDB path does not exist: ${chromaPath}`);
          setProcessing(false);
          return;
        }
        
        console.log("✅ ChromaDB path exists:", chromaPath);
      } catch (error) {
        console.error("ERROR checking ChromaDB path:", error);
        toast.error(`Error checking ChromaDB path: ${error instanceof Error ? error.message : String(error)}`);
        setProcessing(false);
        return;
      }
      
      // Create a new ChromaDB client
      console.log("Creating ChromaDB client with path:", chromaPath);
      const chromaClient = new ChromaClient(chromaPath, apiKey);
      console.log("Initializing ChromaDB client...");
      await chromaClient.initialize();
      console.log("✅ ChromaDB client initialized");
      
      // Get tech details from props - this ensures we use the saved values
      const techDetails: TechDetails = {
        category,
        language,
        languageVersion,
        framework,
        frameworkVersion,
        library,
        libraryVersion
      };
      
      console.log("Tech details for processing:", techDetails);

      console.log("Starting batch processing of URLs");
      // Process batch
      processBatch(
        sourcesToProcess,
        techDetails,
        apiKey,
        chromaClient,
        {
          cleanupModel: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          extractConcepts: true
        },
        (url, status, statusProgress) => {
          console.log(`Processing status update: URL=${url}, status=${status}, progress=${statusProgress}`);
          setCurrentUrl(url);
          setCurrentStatus(status);
          if (statusProgress !== undefined) {
            setProgress(statusProgress);
          }
        },
        (results) => {
          console.log("✅ Processing complete:", results.length, "URLs processed");
          console.log("Results summary:", results.map(r => `${r.url}: ${r.snippets.length} snippets`));
          setProcessedCount(results.length);
          setProcessing(false);
          onComplete(results);
        }
      );
    } catch (error) {
      console.error("ERROR starting processing:", error);
      toast.error("Failed to start processing");
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    setIsCancelling(true);
    processingCancelRef.current = true;
    toast.info("Cancelling processing. This may take a moment...");
    
    // Wait a short time to allow for any in-progress operations to attempt to check cancel state
    setTimeout(() => {
      setProcessing(false);
      setIsCancelling(false);
      onCancel();
    }, 500);
  };

  return (
    <div className="space-y-4">
      {showOptions ? (
        <ProcessingOptions 
          onSubmit={handleStartProcessing}
          onCancel={onCancel}
          disabled={processing}
        />
      ) : (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Processing</CardTitle>
            <CardDescription>
              Processing crawled content into documentation snippets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between">
                  <Label>Current URL</Label>
                  <div className="text-sm text-muted-foreground">
                    {processedCount}/{urls.length} URLs
                  </div>
                </div>
                <div className="p-2 border rounded-md bg-muted/50 break-all">
                  {currentUrl ? currentUrl : "Waiting to start..."}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Status</Label>
                  <div className="text-sm font-medium">
                    {getStatusText(currentStatus)}
                  </div>
                </div>
                <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(progress * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-right text-muted-foreground">
                  {Math.min(Math.round(progress * 100), 100)}%
                </div>
              </div>
              
              <div className="pt-4">
                <div className="rounded-md border p-3 bg-muted/50">
                  <h4 className="text-sm font-medium mb-2">Processing Details</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Category:</span>
                      <span className="font-mono">{category}</span>
                    </div>
                    {language && (
                      <div className="flex justify-between">
                        <span>Language:</span>
                        <span className="font-mono">{language} {languageVersion}</span>
                      </div>
                    )}
                    {framework && (
                      <div className="flex justify-between">
                        <span>Framework:</span>
                        <span className="font-mono">{framework} {frameworkVersion}</span>
                      </div>
                    )}
                    {library && (
                      <div className="flex justify-between">
                        <span>Library:</span>
                        <span className="font-mono">{library} {libraryVersion}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling..." : "Cancel Processing"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}