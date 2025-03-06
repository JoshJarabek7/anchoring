import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { markdownCleanupFormSchema, type MarkdownCleanupValues } from "@/types/forms";

interface ProcessingOptionsProps {
  onSubmit: (values: MarkdownCleanupValues) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export default function ProcessingOptions({
  onSubmit,
  onCancel,
  disabled = false,
}: ProcessingOptionsProps) {
  const [temperature, setTemperature] = useState(0.2);
  
  const form = useForm<MarkdownCleanupValues>({
    resolver: zodResolver(markdownCleanupFormSchema),
    defaultValues: {
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 120000,
    },
  });

  const handleSubmit = (values: MarkdownCleanupValues) => {
    onSubmit(values);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Options</CardTitle>
        <CardDescription>
          Configure options for markdown processing and AI cleanup
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <div className="p-2 border rounded-md bg-muted/20">
                    <div className="text-sm">GPT-4o-mini (Default)</div>
                  </div>
                  <FormDescription>
                    Model used for cleaning up and processing markdown
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="temperature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Temperature: {temperature.toFixed(1)}</FormLabel>
                  <FormControl>
                    <Slider
                      disabled={disabled}
                      min={0}
                      max={1}
                      step={0.1}
                      defaultValue={[temperature]}
                      onValueChange={(values) => {
                        const temp = values[0];
                        setTemperature(temp);
                        field.onChange(temp);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Lower values are more deterministic, higher values more creative
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="rounded-lg border p-4 bg-muted/20 mb-6">
              <div className="text-sm text-muted-foreground">
                Using maximum token context (120,000 tokens) for large document processing
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={disabled}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              Start Processing
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}