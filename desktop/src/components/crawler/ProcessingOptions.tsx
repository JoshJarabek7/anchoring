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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { markdownCleanupFormSchema, type MarkdownCleanupValues } from "@/types/forms";

interface ProcessingOptionsProps {
  onSubmit: (values: MarkdownCleanupValues & { parallelProcessing: number, unlimitedParallelism: boolean }) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export default function ProcessingOptions({
  onSubmit,
  onCancel,
  disabled = false,
}: ProcessingOptionsProps) {
  const [temperature, setTemperature] = useState(0.2);
  const [parallelProcessing, setParallelProcessing] = useState(4); // Default to 4 concurrent
  const [unlimitedParallelism, setUnlimitedParallelism] = useState(false);
  
  const form = useForm<MarkdownCleanupValues>({
    resolver: zodResolver(markdownCleanupFormSchema),
    defaultValues: {
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 120000,
    },
  });

  const handleSubmit = (values: MarkdownCleanupValues) => {
    onSubmit({
      ...values,
      parallelProcessing,
      unlimitedParallelism
    });
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
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Checkbox
                    id="unlimited-parallelism"
                    checked={unlimitedParallelism}
                    onCheckedChange={(checked) => {
                      setUnlimitedParallelism(checked === true);
                    }}
                  />
                  <label
                    htmlFor="unlimited-parallelism"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Unlimited parallelism (Process all URLs simultaneously)
                  </label>
                </div>
                
                {!unlimitedParallelism && (
                  <>
                    <Label htmlFor="parallel-processing">
                      Parallel Processing: {parallelProcessing} URLs
                    </Label>
                    <div className="flex items-center space-x-4 mt-2">
                      <Slider
                        id="parallel-processing"
                        disabled={disabled}
                        min={1}
                        max={16}
                        step={1}
                        defaultValue={[parallelProcessing]}
                        value={[parallelProcessing]}
                        onValueChange={(values) => {
                          setParallelProcessing(values[0]);
                        }}
                        className="flex-grow"
                      />
                    </div>
                    
                    <FormDescription className="mt-2">
                      Higher values process more URLs in parallel but use more system resources
                    </FormDescription>
                  </>
                )}
              </div>
            </div>
            
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