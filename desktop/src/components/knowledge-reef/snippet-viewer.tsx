import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";
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
}

export const SnippetViewer = ({ snippet }: SnippetViewerProps) => {
  const [copied, setCopied] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");

  useEffect(() => {
    // Simple markdown to HTML conversion just for the demo
    // For a real app, use a proper markdown parser like marked or remark
    const convertedContent = snippet.content
      .replace(
        /^# (.+)$/gm,
        '<h1 class="text-2xl font-bold text-blue-900 dark:text-blue-50 mb-4">$1</h1>'
      )
      .replace(
        /^## (.+)$/gm,
        '<h2 class="text-xl font-bold text-blue-800 dark:text-blue-100 mb-3">$1</h2>'
      )
      .replace(
        /^### (.+)$/gm,
        '<h3 class="text-lg font-bold text-blue-700 dark:text-blue-200 mb-2">$1</h3>'
      )
      .replace(/^\* (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/\n\n/g, '<div class="mb-4"></div>')
      .replace(/```([\s\S]*?)```/g, (_, code) => {
        const trimmedCode = code.trim();
        const language = trimmedCode.split("\n")[0];
        const actualCode = language
          ? trimmedCode.substring(language.length).trim()
          : trimmedCode;

        return `<pre class="bg-blue-950/10 dark:bg-blue-900/30 p-4 rounded-md overflow-x-auto glass-depth-1 my-4"><code class="text-sm font-mono text-blue-900 dark:text-blue-100">${actualCode}</code></pre>`;
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
      <div className="p-4 border-b border-white/10 dark:border-blue-800/30 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-medium text-blue-900 dark:text-blue-100">
            {snippet.title}
          </h2>
          <p className="text-sm text-blue-800/70 dark:text-blue-300/70 mt-1">
            {snippet.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
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
        className="flex-1 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <ScrollArea className="h-full p-6">
          <div
            className="prose prose-blue dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />

          {/* Source URL and concepts footer */}
          <div className="mt-8 pt-4 border-t border-blue-200/30 dark:border-blue-800/30">
            <div className="flex flex-wrap gap-1 mb-2">
              {snippet.concepts?.map((concept) => (
                <span
                  key={concept}
                  className="inline-flex text-xs px-2 py-0.5 rounded-full bg-blue-100/50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                >
                  {concept}
                </span>
              ))}
            </div>

            <p className="text-sm text-blue-700/70 dark:text-blue-400/70 mt-2">
              Source:{" "}
              <a
                href={snippet.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
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
