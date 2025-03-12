import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useVectorDB } from '../../hooks/useVectorDB';
import { UniversalDocument } from '@/lib/vector-db';

import { Button } from "@/components/ui/button";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import {
  ProcessingStatus,
  DocumentSource,
  processBatch,
  TechDetails
} from "@/lib/pipeline";
import { MarkdownCleanupValues } from "@/types/forms";
import { 
  DocumentationCategory,
  FullDocumentationSnippet,
  getSession
} from "@/lib/db";
import ProcessingOptions from "./ProcessingOptions";

interface ProcessingPipelineProps {
  urls: { id: number; url: string; html?: string; markdown?: string }[];
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

const convertToUniversalDocument = (doc: FullDocumentationSnippet): UniversalDocument => ({
  id: doc.snippet_id,
  content: doc.content,
  metadata: {
    category: doc.category,
    language: doc.language,
    language_version: doc.language_version,
    framework: doc.framework,
    framework_version: doc.framework_version,
    library: doc.library,
    library_version: doc.library_version,
    title: doc.title,
    description: doc.description || "",
    source_url: doc.source_url || "",
    concepts: doc.concepts || []
  }
});

export default function ProcessingPipeline({
  urls,
  apiKey,
  sessionId,
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
  const [results, setResults] = useState<{ url: string; snippets: FullDocumentationSnippet[] }[]>([]);
  
  useEffect(() => {
    if (!apiKey) {
      toast.error("OpenAI API key is missing. Please add your API key in Settings.", {
        id: "api-key-missing-pipeline",
        duration: 5000,
      });
      onCancel();
    }
  }, [apiKey, onCancel]);
  
  const { 
    vectorDB, 
    loading: vectorDBLoading, 
    error: vectorDBError,
    addDocuments,
    isInitialized
  } = useVectorDB(sessionId);
  
  useEffect(() => {
    if (vectorDB && apiKey && typeof vectorDB.updateApiKey === 'function') {
      try {
        vectorDB.updateApiKey(apiKey);
      } catch (error) {
        console.error("Error updating VectorDB API key:", error);
      }
    }
  }, [vectorDB, apiKey]);

  const getStatusText = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.CONVERTING:
        return "Converting HTML to Markdown";
      case ProcessingStatus.CLEANING:
        return "Cleaning up Markdown with AI";
      case ProcessingStatus.CHUNKING:
        return "Processing into document snippets";
      case ProcessingStatus.EMBEDDING:
        return "Embedding and storing in Vector Database";
      case ProcessingStatus.COMPLETE:
        return "Processing complete";
      case ProcessingStatus.ERROR:
        return "Error during processing";
      default:
        return "Waiting to start";
    }
  };

  const handleStartProcessing = async (options: MarkdownCleanupValues & { parallelProcessing: number, unlimitedParallelism: boolean }) => {
    if (!apiKey || apiKey.trim() === "") {
      toast.error("OpenAI API key is missing. Please add your API key in Settings.", {
        id: "api-key-missing-start-processing",
        duration: 5000,
      });
      onCancel();
      return;
    }
    
    if (vectorDBLoading) {
      toast.error("Vector database is still loading");
      return;
    }
    
    if (vectorDBError) {
      toast.error(`Vector database error: ${vectorDBError.message}`);
      return;
    }
    
    if (!vectorDB) {
      toast.error("Vector database is not initialized");
      return;
    }
    
    if (!isInitialized) {
      toast.error("Vector database is not available");
      return;
    }
    
    setShowOptions(false);
    setProcessing(true);
    setProgress(0);
    setProcessedCount(0);
    processedUrlsRef.current = new Set<string>();
    setResults([]);
    
    const sourcesToProcess: DocumentSource[] = urls
      .filter(url => url.markdown)
      .map(url => ({
        url: url.url,
        markdown: url.markdown!,
        id: url.id
      }));

    if (sourcesToProcess.length === 0) {
      console.error("ERROR: No URLs with markdown content to process");
      toast.error("No URLs with markdown content to process");
      return;
    }

    try {
      setShowOptions(false);
      setProcessing(true);

      const session = await getSession(sessionId);
      if (!session) {
        throw new Error("Session not found");
      }

      const techDetails: TechDetails = {
        category,
        language,
        languageVersion,
        framework,
        frameworkVersion,
        library,
        libraryVersion
      };

      const maxConcurrency = options.unlimitedParallelism ? 
        sourcesToProcess.length : 
        options.parallelProcessing;
      
      processBatch(
        sourcesToProcess,
        techDetails,
        apiKey,
        { addDocuments, isInitialized },
        {
          cleanupModel: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          extractConcepts: true,
          maxConcurrency
        },
        (url, status, statusProgress, overallProgress) => {
          setCurrentUrl(url);
          setCurrentStatus(status);
          
          if ((status === ProcessingStatus.COMPLETE || status === ProcessingStatus.ERROR) && !processedUrlsRef.current.has(url)) {
            processedUrlsRef.current.add(url);
            setProcessedCount(prevCount => Math.min(prevCount + 1, urls.length));
          }
          
          if (overallProgress !== undefined) {
            setProgress(overallProgress);
          } else if (statusProgress !== undefined) {
            setProgress(statusProgress);
          }
        },
        async (results) => {
          processedUrlsRef.current.clear();
          const finalCount = Math.min(results.length, urls.length);
          setProcessedCount(finalCount);
          await handleProcessingComplete(results);
        }
      );
    } catch (error) {
      console.error("Failed to start processing:", error);
      toast.error(`Processing failed: ${error instanceof Error ? error.message : String(error)}`);
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    setProcessing(false);
    onCancel();
  };

  const processDocuments = async (documents: FullDocumentationSnippet[]) => {
    if (!isInitialized) {
      console.error("Vector database is not available");
      return;
    }
    
    try {
      const universalDocs = documents.map(convertToUniversalDocument);
      await addDocuments(universalDocs);
      return true;
    } catch (error) {
      console.error("Error adding documents to vector database:", error);
      return false;
    }
  };

  const handleProcessingComplete = async (results: any) => {
    const newProcessedUrls = results
      .filter((result: any) => result.success)
      .map((result: any) => result.url);
    
    if (newProcessedUrls.length <= 3) {
      toast.success(`Processed ${newProcessedUrls.length} URLs successfully`, { 
        duration: 2000,
        id: "processing-success"
      });
    }
    
    setProcessing(false);
    onComplete(results);
  };

  if (vectorDBLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Processing</CardTitle>
          <CardDescription>
            Initializing vector database...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full bg-secondary overflow-hidden rounded-full">
            <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }}></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (vectorDBError) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>
            Failed to initialize vector database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-md">
            {vectorDBError.message}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
                >
                  Cancel Processing
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}