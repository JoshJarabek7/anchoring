import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { createSession, CrawlSession, getVectorDBSettings } from "../../lib/db";
import { configureSessionVectorDB } from "../../lib/vector-db/service";

interface CreateSessionFormProps {
  onSessionCreated: (session: CrawlSession) => void;
  onCancel: () => void;
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  version: z.string().optional(),
  vectorDb: z.enum(["local", "shared"], {
    required_error: "Please select a vector database",
  }),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateSessionForm({ 
  onSessionCreated, 
  onCancel 
}: CreateSessionFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [versionValue, setVersionValue] = useState("");
  const [vectorDbValue, setVectorDbValue] = useState<"local" | "shared">("local");
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      version: "",
      vectorDb: "local",
    },
    mode: "all",
  });
  
  const onSubmit = async (data: FormData) => {
    try {
      setSubmitting(true);
      console.log("Creating session with data:", data);
      
      // Additional validation and prepare data
      if (!titleValue || titleValue.trim() === "") {
        throw new Error("Title is required");
      }
      
      // Create session with manually prepared data
      const sessionData = {
        title: titleValue.trim(),
        version: versionValue.trim()
      };
      
      console.log("Submitting session data:", sessionData);
      const session = await createSession(sessionData);
      
      // Configure vector DB for the session
      const vectorDbType = vectorDbValue;
      const vectorDbSettings = await getVectorDBSettings();
      
      if (vectorDbType === 'local') {
        await configureSessionVectorDB(session.id!, 'chroma', {
          host: 'localhost',
          port: 8000,
          apiKey: vectorDbSettings.pinecone_api_key // We use the same API key for OpenAI embeddings
        });
      } else {
        await configureSessionVectorDB(session.id!, 'pinecone', {
          apiKey: vectorDbSettings.pinecone_api_key,
          environment: vectorDbSettings.pinecone_environment,
          indexName: vectorDbSettings.pinecone_index
        });
      }
      
      console.log("Session created successfully:", session);
      onSessionCreated(session);
    } catch (error) {
      console.error("Failed to create session:", error);
      alert("Failed to create session. Please try again. Error: " + String(error));
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create New Session</CardTitle>
        <CardDescription>Create a new documentation crawl session.</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit((data) => {
        console.log("Form submit event triggered with validated data:", data);
        onSubmit(data);
      })}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              placeholder="e.g., Tauri V2 Documentation"
              value={titleValue}
              onChange={(e) => {
                const value = e.target.value;
                setTitleValue(value);
                form.setValue("title", value);
              }}
            />
            {form.formState.errors.title?.message && (
              <p className="text-sm text-red-500">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="version">Version (Optional)</Label>
            <Input
              id="version"
              placeholder="e.g., 2.0.0"
              value={versionValue}
              onChange={(e) => {
                const value = e.target.value;
                setVersionValue(value);
                form.setValue("version", value);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vectorDb">Vector Database</Label>
            <Select
              value={vectorDbValue}
              onValueChange={(value: "local" | "shared") => {
                setVectorDbValue(value);
                form.setValue("vectorDb", value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a vector database" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local ChromaDB</SelectItem>
                <SelectItem value="shared">Shared Pinecone DB</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.vectorDb && (
              <p className="text-sm text-red-500">
                {form.formState.errors.vectorDb.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button 
            type="button" 
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            disabled={submitting || !titleValue.trim()}
          >
            {submitting ? "Creating..." : "Create Session"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}