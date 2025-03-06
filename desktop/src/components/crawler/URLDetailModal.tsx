import { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CrawlURL } from "@/lib/db";

interface URLDetailModalProps {
  url: CrawlURL | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function URLDetailModal({ url, open, onOpenChange }: URLDetailModalProps) {
  const [activeTab, setActiveTab] = useState("info");
  
  // Reset tab when URL changes
  useEffect(() => {
    if (url) {
      setActiveTab("info");
    }
  }, [url]);
  
  if (!url) {
    return null;
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'crawled':
        return 'default';
      case 'error':
        return 'destructive';
      case 'skipped':
        return 'outline';
      default:
        return 'secondary';
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>URL Details</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">
            {url.url}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center space-x-2 my-2">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={getStatusColor(url.status)}>
            {url.status}
          </Badge>
          {url.id && (
            <span className="text-xs text-muted-foreground ml-auto">ID: {url.id}</span>
          )}
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList>
            <TabsTrigger value="info">Info</TabsTrigger>
            {url.html && <TabsTrigger value="html">HTML</TabsTrigger>}
            {url.markdown && <TabsTrigger value="markdown">Markdown</TabsTrigger>}
            {url.cleaned_markdown && <TabsTrigger value="cleaned">Cleaned Markdown</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="info" className="flex-1 border rounded-md p-4 mt-2">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium">URL</h3>
                <p className="font-mono text-xs break-all">{url.url}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Status</h3>
                <p>{url.status}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Content Status</h3>
                <div className="space-y-1">
                  <div className="flex items-center">
                    <span className="text-xs">HTML:</span>
                    <Badge variant={url.html ? "default" : "outline"} className="ml-2">
                      {url.html ? "Available" : "Not Available"}
                    </Badge>
                    {url.html && (
                      <span className="text-xs ml-2">
                        ({(url.html.length / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs">Markdown:</span>
                    <Badge variant={url.markdown ? "default" : "outline"} className="ml-2">
                      {url.markdown ? "Available" : "Not Available"}
                    </Badge>
                    {url.markdown && (
                      <span className="text-xs ml-2">
                        ({(url.markdown.length / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs">Cleaned Markdown:</span>
                    <Badge variant={url.cleaned_markdown ? "default" : "outline"} className="ml-2">
                      {url.cleaned_markdown ? "Available" : "Not Available"}
                    </Badge>
                    {url.cleaned_markdown && (
                      <span className="text-xs ml-2">
                        ({(url.cleaned_markdown.length / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          {url.html && (
            <TabsContent value="html" className="flex-1 border rounded-md mt-2">
              <ScrollArea className="h-[400px] w-full">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{url.html}</pre>
              </ScrollArea>
            </TabsContent>
          )}
          
          {url.markdown && (
            <TabsContent value="markdown" className="flex-1 border rounded-md mt-2">
              <ScrollArea className="h-[400px] w-full">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{url.markdown}</pre>
              </ScrollArea>
            </TabsContent>
          )}
          
          {url.cleaned_markdown && (
            <TabsContent value="cleaned" className="flex-1 border rounded-md mt-2">
              <ScrollArea className="h-[400px] w-full">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap">{url.cleaned_markdown}</pre>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 