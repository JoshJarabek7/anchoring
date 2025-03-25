import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Check, Copy, ExternalLink, Zap } from "lucide-react";
import { useEffect, useState } from "react";

interface DocumentationSnippet {
  id: string;
  title: string;
  description: string;
  content: string;
  sourceUrl: string;
  technologyId: string;
  versionId: string;
  concepts?: string[];
}

interface SnippetViewerProps {
  snippet: DocumentationSnippet;
  similarity?: number; // Optional similarity score for search results
}

export const SnippetViewer = ({ snippet, similarity }: SnippetViewerProps) => {
  const [copied, setCopied] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");

  // Format similarity score as percentage when available
  // Using same normalization approach as search-result-card.tsx
  // The backend uses cosine distance with the <-> operator in pgvector
  // For cosine distance: 0 = identical vectors, 2 = completely opposite vectors
  const similarityPercentage =
    similarity !== undefined
      ? Math.max(0, Math.min(100, Math.round((1 - similarity / 2) * 100)))
      : null;

  useEffect(() => {
    // Enhanced markdown to HTML conversion with better styling
    const convertedContent = snippet.content
      // Headers with appropriate styling
      .replace(
        /^# (.+)$/gm,
        '<h1 class="text-2xl font-bold text-blue-50 mb-4 mt-6 break-words">$1</h1>'
      )
      .replace(
        /^## (.+)$/gm,
        '<h2 class="text-xl font-bold text-blue-100 mb-3 mt-5 break-words">$1</h2>'
      )
      .replace(
        /^### (.+)$/gm,
        '<h3 class="text-lg font-bold text-blue-200 mb-2 mt-4 break-words">$1</h3>'
      )
      .replace(
        /^#### (.+)$/gm,
        '<h4 class="text-md font-semibold text-blue-200 mb-2 mt-3 break-words">$1</h4>'
      )
      // Lists with proper styling
      .replace(
        /^\* (.+)$/gm,
        '<li class="ml-6 mb-1 text-blue-100 break-words">$1</li>'
      )
      .replace(
        /^- (.+)$/gm,
        '<li class="ml-6 mb-1 text-blue-100 break-words">$1</li>'
      )
      .replace(
        /^  \* (.+)$/gm,
        '<li class="ml-10 mb-1 text-blue-100 break-words">$1</li>'
      )
      .replace(
        /^  - (.+)$/gm,
        '<li class="ml-10 mb-1 text-blue-100 break-words">$1</li>'
      )
      // Add unordered list wrapper
      .replace(/<li class="ml-6/g, '<ul class="list-disc mb-4"><li class="ml-6')
      .replace(/<\/li>\n(?!<li)/g, "</li></ul>\n")
      // Paragraphs with good spacing
      .replace(
        /\n\n([^<#].+)\n/g,
        '\n\n<p class="mb-4 text-blue-100 leading-relaxed break-words">$1</p>\n'
      )
      .replace(
        /\n\n([^<#].+)$/g,
        '\n\n<p class="mb-4 text-blue-100 leading-relaxed break-words">$1</p>'
      )
      // Add more space between sections
      .replace(/\n\n/g, '<div class="mb-4"></div>')
      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-50 font-mono text-sm break-words">$1</code>'
      )
      // Code blocks with language support
      .replace(/```([\s\S]*?)```/g, (_, code) => {
        const trimmedCode = code.trim();
        const firstLine = trimmedCode.split("\n")[0];
        const actualCode = firstLine.match(/^[a-zA-Z0-9]+$/)
          ? trimmedCode.substring(firstLine.length).trim()
          : trimmedCode;

        return `<pre class="bg-blue-900/40 p-4 rounded-md overflow-x-auto glass-depth-1 my-4 border border-blue-800/30 whitespace-pre-wrap"><code class="text-sm font-mono text-blue-100 break-words">${actualCode}</code></pre>`;
      });

    setHtmlContent(convertedContent);
  }, [snippet.content]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(snippet.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with title and actions */}
      <div className="p-4 border-b border-blue-800/30 flex justify-between items-start flex-wrap gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <h2 className="text-xl font-medium text-blue-50 break-words">
              {snippet.title}
            </h2>

            {/* Display similarity badge when available */}
            {similarityPercentage !== null && (
              <div className="flex items-center gap-1 bg-blue-500/30 rounded-full px-2.5 py-1 text-xs font-medium">
                <Zap className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-blue-50">
                  {similarityPercentage}% match
                </span>
              </div>
            )}
          </div>
          <p className="text-sm text-blue-200 mt-1 break-words">
            {snippet.description}
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="glass-surface flex items-center gap-1"
            onClick={copyToClipboard}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="glass-surface flex items-center gap-1"
            onClick={() => window.open(snippet.sourceUrl, "_blank")}
          >
            <ExternalLink className="h-4 w-4" />
            Source
          </Button>
        </div>
      </div>

      {/* Content area */}
      <motion.div
        className="flex-1 overflow-auto break-words"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <ScrollArea className="h-full p-6">
          <div
            className="max-w-none text-blue-100 whitespace-normal break-words"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />

          {/* Source URL and concepts footer */}
          <div className="mt-8 pt-4 border-t border-blue-800/30">
            <div className="flex flex-wrap gap-1 mb-2">
              {snippet.concepts?.map((concept) => (
                <span
                  key={concept}
                  className="inline-flex text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-200"
                >
                  {concept}
                </span>
              ))}
            </div>

            <p className="text-sm text-blue-300 mt-2 break-words">
              Source:{" "}
              <a
                href={snippet.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-200 transition-colors word-break break-all"
              >
                {snippet.sourceUrl}
              </a>
            </p>
          </div>
        </ScrollArea>
      </motion.div>
    </div>
  );
};
