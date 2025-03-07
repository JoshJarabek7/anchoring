import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/components/ui/sonner";
import * as fs from '@tauri-apps/plugin-fs';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormControl, FormMessage, FormLabel, FormDescription } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { saveUserSettings, getUserSettings } from "@/lib/db";
import { apiSettingsFormSchema, type ApiSettingsValues } from "@/types/forms";

export default function ApiSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const form = useForm<ApiSettingsValues>({
    resolver: zodResolver(apiSettingsFormSchema),
    defaultValues: {
      openai_key: "",
      chroma_path: "",
    },
  });
  
  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await getUserSettings();
      console.log("Loading settings in API settings form:", settings);
      
      if (settings.openai_key) {
        form.setValue("openai_key", settings.openai_key);
      }
      
      if (settings.chroma_path) {
        form.setValue("chroma_path", settings.chroma_path);
        console.log("Setting ChromaDB path in form:", settings.chroma_path);
      }
    } catch (error) {
      console.error("Failed to load API settings:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const validateChromaPath = async (path: string): Promise<boolean> => {
    if (!path) return false;
    
    try {
      const pathExists = await fs.exists(path);
      if (!pathExists) {
        // Try to create the directory
        await fs.mkdir(path, { recursive: true });
        return true;
      }
      return true;
    } catch (error) {
      console.error("Error validating ChromaDB path:", error);
      return false;
    }
  };
  
  const onSubmit = async (data: ApiSettingsValues) => {
    try {
      setSaving(true);
      
      // Validate ChromaDB path if provided
      if (data.chroma_path) {
        const isValid = await validateChromaPath(data.chroma_path);
        if (!isValid) {
          toast.error("Invalid ChromaDB path. Please check the directory exists and is accessible.");
          setSaving(false);
          return;
        }
      }
      
      console.log("Saving settings to database:", data);
      
      // Save the settings
      await saveUserSettings({
        openai_key: data.openai_key,
        chroma_path: data.chroma_path,
      });
      
      // Get the saved settings to confirm
      const savedSettings = await getUserSettings();
      console.log("Saved settings confirmed:", savedSettings);
      
      toast.success("API settings saved successfully");
      
      // Reload the page to apply the new settings if path has changed
      if (data.chroma_path && form.formState.isDirty && form.formState.dirtyFields.chroma_path) {
        toast.info("Application will reload to apply the new ChromaDB path");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to save API settings:", error);
      toast.error("Failed to save API settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Settings</CardTitle>
        <CardDescription>Configure API keys and paths for services.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="openai_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenAI API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="sk-..."
                        {...field}
                        disabled={loading}
                      />
                    </FormControl>
                    <FormDescription>
                      Required for cleaning up and chunking markdown files using GPT-4o-mini.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="chroma_path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ChromaDB Path</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="/path/to/chromadb"
                        {...field}
                        disabled={loading}
                      />
                    </FormControl>
                    <FormDescription>
                      Directory where ChromaDB will store vector embeddings. This path will be used for all new sessions by default.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              type="submit"
              disabled={loading || saving}
            >
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}