// Event types for Channel API communication with Tauri backend

export type CrawlEvent = 
  | { event: 'started'; data: { taskId: string; url: string } }
  | { event: 'progress'; data: { urlCount: number; processedCount: number } }
  | { event: 'url_discovered'; data: { url: string } }
  | { event: 'finished'; data: { taskId: string; totalUrls: number } }
  | { event: 'error'; data: { message: string } };

export type MarkdownEvent =
  | { event: 'started'; data: { urlCount: number } }
  | { event: 'progress'; data: { current: number; total: number; url: string } }
  | { event: 'finished'; data: { taskIds: string[] } }
  | { event: 'error'; data: { message: string } };

export type SnippetEvent =
  | { event: 'started'; data: { urlCount: number } }
  | { event: 'progress'; data: { current: number; total: number; url: string } }
  | { event: 'finished'; data: { taskIds: string[] } }
  | { event: 'error'; data: { message: string } }; 