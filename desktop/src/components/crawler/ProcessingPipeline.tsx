import { useState, useRef, useEffect } from "react";
import { toast } from "@/components/ui/sonner";

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
  const processedUrlsRef = useRef(new Set<string>());
  const [isCancelling, setIsCancelling] = useState(false);
  const processingCancelRef = useRef(false);

  // Cleanup effect is no longer needed since toasts have proper durations
  useEffect(() => {
    return () => {
      // No cleanup needed - toasts auto-dismiss
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

  const handleStartProcessing = async (options: MarkdownCleanupValues & { parallelProcessing: number, unlimitedParallelism: boolean }) => {
    // Reset processed URLs set and counter when starting new processing
    processedUrlsRef.current.clear();
    setProcessedCount(0);
    console.log("================================");
    console.log("STARTING PROCESSING PIPELINE");
    console.log("================================");
    console.log("Processing options:", options);
    console.log("URLs to process:", urls.length);
    console.log(`Parallelism: ${options.unlimitedParallelism ? 'Unlimited' : options.parallelProcessing}`);

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

      // Note: apiKey is already validated at the beginning of this function
      console.log("OpenAI API key (truncated):", `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
      
      // Create a new ChromaDB client (now using HTTP connection)
      console.log("Creating ChromaDB client");
      const chromaClient = new ChromaClient(apiKey);
      console.log("Initializing ChromaDB client...");
      
      try {
        await chromaClient.initialize();
        console.log("✅ ChromaDB client initialized");
      } catch (error) {
        console.error("ERROR initializing ChromaDB client:", error);
        toast.error(`Error connecting to ChromaDB: ${error instanceof Error ? error.message : String(error)}`);
        setProcessing(false);
        return;
      }
      
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

      // Determine max concurrency based on user selection
      const maxConcurrency = options.unlimitedParallelism ? 
        sourcesToProcess.length : // Use all URLs if unlimited
        options.parallelProcessing; // Otherwise use user-specified value
      
      console.log(`Starting batch processing of URLs with max concurrency: ${maxConcurrency}`);
      
      // Process batch with the desired concurrency
      processBatch(
        sourcesToProcess,
        techDetails,
        apiKey,
        chromaClient,
        {
          cleanupModel: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          extractConcepts: true,
          maxConcurrency // Pass the concurrency setting to the processor
        },
        (url, status, statusProgress, overallProgress) => {
          console.log(`Processing status update: URL=${url}, status=${status}, statusProgress=${statusProgress}, overallProgress=${overallProgress}`);
          setCurrentUrl(url);
          setCurrentStatus(status);
          
          // Update processed count for every status update to keep the count current
          // This ensures the count updates in real-time and not just at the end
          if ((status === ProcessingStatus.COMPLETE || status === ProcessingStatus.ERROR) && !processedUrlsRef.current.has(url)) {
            // Only increment if this URL hasn't been processed before
            processedUrlsRef.current.add(url);
            setProcessedCount(prevCount => Math.min(prevCount + 1, urls.length));
            console.log(`URL ${url} completed. Processed count: ${processedUrlsRef.current.size}/${urls.length}`);
          }
          
          // Always use the overall progress for the UI if available
          if (overallProgress !== undefined) {
            setProgress(overallProgress);
          } else if (statusProgress !== undefined) {
            setProgress(statusProgress);
          }
        },
        (results) => {
          console.log("✅ Processing complete:", results.length, "URLs processed");
          console.log("Results summary:", results.map(r => `${r.url}: ${r.snippets.length} snippets`));
          
          // Reset for next time
          processedUrlsRef.current.clear();
          
          // Make sure the final count doesn't exceed the total URLs
          const finalCount = Math.min(results.length, urls.length);
          setProcessedCount(finalCount);
          
          setProcessing(false);
          onComplete(results);
        }
      );
    } catch (error) {
      console.error("ERROR starting processing:", error);
      // Only log error, no toast needed
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    setIsCancelling(true);
    processingCancelRef.current = true;
    // No need for toast notification
    
    // Cancel immediately - no need to wait for operations to check cancel state
    setProcessing(false);
    setIsCancelling(false);
    onCancel();
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