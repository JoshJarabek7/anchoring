import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { saveCrawlSettings, CrawlSettings } from "../../lib/db";

interface CrawlerFormProps {
  sessionId: number;
  existingSettings?: CrawlSettings;
  onSettingsSaved: (settings: CrawlSettings) => void;
}

const formSchema = z.object({
  prefix_path: z.string().min(1, "Prefix path is required"),
  anti_paths: z.string(),
  anti_keywords: z.string(),
  max_concurrent_requests: z.number().int().min(1).max(16).optional(),
  unlimited_parallelism: z.boolean().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CrawlerForm({ 
  sessionId, 
  existingSettings,
  onSettingsSaved
}: CrawlerFormProps) {
  const [saving, setSaving] = useState(false);
  const [prefixPath, setPrefixPath] = useState(existingSettings?.prefix_path || "");
  const [antiPaths, setAntiPaths] = useState(existingSettings?.anti_paths || "");
  const [antiKeywords, setAntiKeywords] = useState(existingSettings?.anti_keywords || "");
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(existingSettings?.max_concurrent_requests || 4);
  const [unlimitedParallelism, setUnlimitedParallelism] = useState(existingSettings?.unlimited_parallelism || false);
  
  // Update local state when existingSettings changes
  useEffect(() => {
    console.log("Updating CrawlerForm with settings:", existingSettings);
    if (existingSettings) {
      setPrefixPath(existingSettings.prefix_path || "");
      setAntiPaths(existingSettings.anti_paths || "");
      setAntiKeywords(existingSettings.anti_keywords || "");
      setMaxConcurrentRequests(existingSettings.max_concurrent_requests || 4);
      setUnlimitedParallelism(existingSettings.unlimited_parallelism || false);
      
      // Also update the form state
      form.reset({
        prefix_path: existingSettings.prefix_path || "",
        anti_paths: existingSettings.anti_paths || "",
        anti_keywords: existingSettings.anti_keywords || "",
        max_concurrent_requests: existingSettings.max_concurrent_requests || 4,
        unlimited_parallelism: existingSettings.unlimited_parallelism || false,
      });
    }
  }, [existingSettings]);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prefix_path: existingSettings?.prefix_path || "",
      anti_paths: existingSettings?.anti_paths || "",
      anti_keywords: existingSettings?.anti_keywords || "",
      max_concurrent_requests: existingSettings?.max_concurrent_requests || 4,
      unlimited_parallelism: existingSettings?.unlimited_parallelism || false,
    },
    mode: "all",
  });
  
  const onSubmit = async () => {
    try {
      setSaving(true);
      
      // Prepare data using state values
      const settings = await saveCrawlSettings({
        session_id: sessionId,
        prefix_path: prefixPath.trim(),
        anti_paths: antiPaths.trim(),
        anti_keywords: antiKeywords.trim(),
        max_concurrent_requests: unlimitedParallelism ? 1000 : maxConcurrentRequests,
        unlimited_parallelism: unlimitedParallelism,
      });
      
      onSettingsSaved(settings);
    } catch (error) {
      console.error("Failed to save crawler settings:", error);
      alert("Failed to save crawler settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Crawler Configuration</CardTitle>
        <CardDescription>Configure the web crawler settings.</CardDescription>
      </CardHeader>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!prefixPath.trim()) {
          alert("URL Prefix Path is required");
          return;
        }
        onSubmit();
      }}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prefix_path">URL Prefix Path <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Input
                id="prefix_path"
                placeholder="e.g., https://v2.tauri.app"
                value={prefixPath}
                onChange={(e) => {
                  const value = e.target.value;
                  setPrefixPath(value);
                  form.setValue("prefix_path", value);
                }}
                className={`${!prefixPath.startsWith('http') && prefixPath ? 'border-amber-500 focus:ring-amber-500' : ''}`}
              />
              {!prefixPath.startsWith('http') && prefixPath && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-amber-500 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  </span>
                </div>
              )}
            </div>
            {form.formState.errors.prefix_path && (
              <p className="text-sm text-red-500">
                {form.formState.errors.prefix_path.message}
              </p>
            )}
            {!prefixPath.startsWith('http') && prefixPath && (
              <p className="text-sm text-amber-500 font-medium">
                URL must start with http:// or https://
              </p>
            )}
            <p className="text-xs text-gray-500">
              Only URLs that start with this prefix will be crawled. Must be a complete URL including protocol.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="anti_paths">Anti-Paths</Label>
            <Textarea
              id="anti_paths"
              placeholder="e.g., /releases,/blog"
              value={antiPaths}
              onChange={(e) => {
                const value = e.target.value;
                setAntiPaths(value);
                form.setValue("anti_paths", value);
              }}
            />
            <p className="text-xs text-gray-500">
              Comma-separated list of URL paths to exclude from crawling.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="anti_keywords">Anti-Keywords</Label>
            <Textarea
              id="anti_keywords"
              placeholder="e.g., release,blog,archive"
              value={antiKeywords}
              onChange={(e) => {
                const value = e.target.value;
                setAntiKeywords(value);
                form.setValue("anti_keywords", value);
              }}
            />
            <p className="text-xs text-gray-500">
              Comma-separated list of keywords to exclude from crawling.
            </p>
          </div>
          
          <div className="border-t pt-6 space-y-5">
            <h3 className="font-medium text-base">Parallelism Settings</h3>
            
            <div className="p-4 border rounded-md bg-muted/10">
              <div className="flex items-center space-x-3 mb-4">
                <div className="relative flex items-center justify-center h-5 w-5">
                  <Checkbox
                    id="unlimited-parallelism"
                    checked={unlimitedParallelism}
                    onCheckedChange={(checked) => {
                      setUnlimitedParallelism(checked === true);
                      form.setValue("unlimited_parallelism", checked === true);
                    }}
                    className="h-5 w-5"
                  />
                  {unlimitedParallelism && (
                    <div className="absolute inset-0 flex items-center justify-center text-primary-foreground pointer-events-none">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                  )}
                </div>
                <label
                  htmlFor="unlimited-parallelism"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Unlimited parallelism (Crawl all URLs simultaneously)
                </label>
              </div>
              
              {!unlimitedParallelism && (
                <div className="pl-8 space-y-3">
                  <Label htmlFor="max_concurrent_requests">
                    Parallel Crawling: <span className="font-medium text-primary">{maxConcurrentRequests} URLs</span>
                  </Label>
                  <div className="flex items-center space-x-4">
                    <Input
                      id="max_concurrent_requests"
                      type="number"
                      min={1}
                      value={maxConcurrentRequests}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 4;
                        setMaxConcurrentRequests(value);
                        form.setValue("max_concurrent_requests", value);
                      }}
                      className="w-24"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Higher values crawl faster but use more system resources
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-6">
          <Button 
            type="submit"
            disabled={saving || !prefixPath.trim() || !prefixPath.startsWith('http')}
            className="min-w-40 bg-primary"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span>Save Configuration</span>
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}