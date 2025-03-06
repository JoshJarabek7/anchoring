import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
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
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prefix_path: existingSettings?.prefix_path || "",
      anti_paths: existingSettings?.anti_paths || "",
      anti_keywords: existingSettings?.anti_keywords || "",
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
            <Input
              id="prefix_path"
              placeholder="e.g., https://v2.tauri.app"
              value={prefixPath}
              onChange={(e) => {
                const value = e.target.value;
                setPrefixPath(value);
                form.setValue("prefix_path", value);
              }}
            />
            {form.formState.errors.prefix_path && (
              <p className="text-sm text-red-500">
                {form.formState.errors.prefix_path.message}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Only URLs that start with this prefix will be crawled.
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
        </CardContent>
        <CardFooter>
          <Button 
            type="submit"
            disabled={saving || !prefixPath.trim()}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}