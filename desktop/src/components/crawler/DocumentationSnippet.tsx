import React from 'react';
import { FullDocumentationSnippet } from '@/lib/db';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface DocumentationSnippetProps {
  snippet: FullDocumentationSnippet;
  onViewSource?: (url: string) => void;
}

export default function DocumentationSnippetCard({ snippet, onViewSource }: DocumentationSnippetProps) {
  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <CardTitle className="text-lg">{snippet.title}</CardTitle>
            {snippet.source_url && (
              <CardDescription className="text-xs truncate max-w-[300px]">
                Source: {snippet.source_url}
              </CardDescription>
            )}
          </div>
          
          {snippet.source_url && onViewSource && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => onViewSource(snippet.source_url || '')}
              className="h-8 w-8"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pb-2">
        <div className="mb-3 text-sm text-muted-foreground">{snippet.description}</div>
        
        {/* Render the markdown content with the prose classes */}
        <div 
          className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:text-foreground prose-headings:font-medium 
          prose-p:text-muted-foreground prose-p:leading-7
          prose-a:text-primary hover:prose-a:underline
          prose-strong:text-foreground prose-strong:font-medium
          prose-code:text-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono
          prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-md prose-pre:p-4 prose-pre:overflow-x-auto
          prose-img:rounded-md
          prose-hr:border-border
          prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground
          prose-table:text-foreground prose-th:bg-muted prose-th:text-foreground prose-td:border-border"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(snippet.content) }}
        />
      </CardContent>
      
      <CardFooter className="flex flex-wrap gap-2 pt-1 pb-3">
        {/* Display metadata as badges */}
        {snippet.category && (
          <Badge variant="outline" className="text-xs">
            {snippet.category}
          </Badge>
        )}
        
        {snippet.language && (
          <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950">
            {snippet.language} {snippet.language_version}
          </Badge>
        )}
        
        {snippet.framework && (
          <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950">
            {snippet.framework} {snippet.framework_version}
          </Badge>
        )}
        
        {snippet.library && (
          <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950">
            {snippet.library} {snippet.library_version}
          </Badge>
        )}
        
        {/* Display concepts if available */}
        {snippet.concepts && snippet.concepts.length > 0 && (
          <div className="w-full mt-2 flex flex-wrap gap-1">
            {snippet.concepts.map((concept, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {concept}
              </Badge>
            ))}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

// Markdown to HTML conversion function
function markdownToHtml(markdown: string): string {
  // Simple markdown to HTML conversion
  let html = markdown
    // Handle code blocks with proper syntax
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Handle inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Handle headings
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Handle bold and italic
    .replace(/\*\*(.*)\*\*/gm, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gm, '<em>$1</em>')
    // Handle links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gm, '<a href="$2">$1</a>')
    // Handle lists
    .replace(/^\s*\n\* (.*)/gm, '<ul>\n<li>$1</li>')
    .replace(/^(\* (.+)\n)+/gm, '<ul>$&</ul>')
    .replace(/^\s*\n\d+\. (.*)/gm, '<ol>\n<li>$1</li>')
    .replace(/^(\d+\. (.+)\n)+/gm, '<ol>$&</ol>')
    // Handle blockquotes
    .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
    // Handle horizontal rules
    .replace(/^\-\-\-$/gm, '<hr>')
    // Handle tables (basic support)
    .replace(/^\|(.+)\|$/gm, '<table><tr>$1</tr></table>')
    .replace(/\|/g, '</td><td>')
    // Handle paragraphs
    .replace(/^(?!<[uo]l|<h|<pre|<p|<blockquote|<table)(.+)\n/gm, '<p>$1</p>');
  
  // Clean up any artifacts from replacements
  html = html
    .replace(/<\/td><td>([^<]*)<\/tr><\/table>/g, '</td><td>$1</td></tr></table>')
    .replace(/<table><tr><\/td><td>/g, '<table><tr><td>');
  
  return html;
} 