import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

import { urlFormSchema, type UrlFormValues } from "@/types/forms";
import { shouldCrawlURL } from "@/lib/crawler";

interface UrlInputProps {
  sessionId: number;
  prefixPath?: string;
  antiPaths?: string[];
  antiKeywords?: string[];
  onUrlAdded: (url: string) => void;
  disabled?: boolean;
}

export default function UrlInput({
  sessionId,
  prefixPath = "",
  antiPaths = [],
  antiKeywords = [],
  onUrlAdded,
  disabled = false
}: UrlInputProps) {
  const [submitting, setSubmitting] = useState(false);
  
  const form = useForm<UrlFormValues>({
    resolver: zodResolver(urlFormSchema),
    defaultValues: {
      url: ""
    }
  });
  
  const onSubmit = async (data: UrlFormValues) => {
    try {
      setSubmitting(true);
      
      // Check if URL matches crawler criteria
      if (prefixPath && !data.url.startsWith(prefixPath)) {
        toast.error(`URL must begin with "${prefixPath}"`);
        return;
      }
      
      const isAllowed = shouldCrawlURL(data.url, {
        startUrl: data.url,
        prefixPath,
        antiPaths,
        antiKeywords,
        sessionId
      });
      
      if (!isAllowed) {
        toast.error("URL doesn't match crawler criteria (contains anti-paths or anti-keywords)");
        return;
      }
      
      // Add the URL
      onUrlAdded(data.url);
      
      // Reset form
      form.reset();
      
      toast.success("URL added successfully");
    } catch (error) {
      console.error("Error adding URL:", error);
      toast.error("Failed to add URL. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add URL</CardTitle>
        <CardDescription>Add a URL to crawl</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-center gap-2">
            <div className="flex-1">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder={prefixPath || "https://example.com"}
                        {...field}
                        disabled={disabled || submitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button 
              type="submit" 
              disabled={disabled || submitting}
            >
              {submitting ? "Adding..." : "Add URL"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}