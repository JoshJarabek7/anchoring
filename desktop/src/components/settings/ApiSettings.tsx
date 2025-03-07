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
    } catch (error) {
      console.error("Failed to load API settings:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // ChromaDB path validation no longer needed - using HTTP endpoint instead
  
  const onSubmit = async (data: ApiSettingsValues) => {
    try {
      setSaving(true);
      
      console.log("Saving settings to database:", data);
      
      // Save the settings - only OpenAI key needed now
      await saveUserSettings({
        openai_key: data.openai_key,
      });
      
      // Get the saved settings to confirm
      const savedSettings = await getUserSettings();
      console.log("Saved settings confirmed:", savedSettings);
      
      toast.success("API key saved successfully", {
        id: "api-settings-success"
      });
    } catch (error) {
      console.error("Failed to save API settings:", error);
      toast.error("Failed to save API settings. Please try again.", {
        id: "api-settings-error" 
      });
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
              
              {/* ChromaDB path field removed - using HTTP container instead */}
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