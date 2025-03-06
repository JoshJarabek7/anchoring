import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "../ui/badge";
import { ChevronLeft, ExternalLink } from "lucide-react";

interface SnippetViewerProps {
  url: string | null;
  snippets: any[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
}

export default function SnippetViewer({ url, snippets, loading, error, onBack }: SnippetViewerProps) {
  if (!url) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBack} 
          className="flex items-center space-x-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Back to URLs</span>
        </Button>
        
        <a 
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm text-primary hover:underline"
        >
          Visit page <ExternalLink className="h-3 w-3 ml-1" />
        </a>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-medium">Snippets</CardTitle>
              <CardDescription className="text-sm truncate" title={url}>
                {url}
              </CardDescription>
            </div>
            <Badge variant="outline">
              {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="p-4 border border-destructive/30 bg-destructive/10 text-destructive rounded-md">
              Error: {error}
            </div>
          ) : snippets.length === 0 ? (
            <div className="p-4 border border-muted rounded-md text-muted-foreground">
              No snippets found for this URL.
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <Accordion type="single" collapsible className="space-y-4">
                {snippets.map((snippet, index) => (
                  <AccordionItem 
                    key={snippet.id || index} 
                    value={snippet.id || `snippet-${index}`}
                    className="border rounded-md px-4"
                  >
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div className="flex flex-col items-start">
                        <h3 className="font-medium">{snippet.title}</h3>
                        {snippet.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {snippet.description}
                          </p>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 pt-2">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Category:</span> {snippet.category}
                          </div>
                          {snippet.language && (
                            <div>
                              <span className="font-medium">Language:</span> {snippet.language} {snippet.language_version}
                            </div>
                          )}
                          {snippet.framework && (
                            <div>
                              <span className="font-medium">Framework:</span> {snippet.framework} {snippet.framework_version}
                            </div>
                          )}
                          {snippet.library && (
                            <div>
                              <span className="font-medium">Library:</span> {snippet.library} {snippet.library_version}
                            </div>
                          )}
                        </div>
                        
                        <div className="p-3 bg-muted rounded-md overflow-auto">
                          <pre className="text-sm whitespace-pre-wrap">
                            {snippet.content}
                          </pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}