import { z } from "zod";

/**
 * Setup form schema - No longer requires ChromaDB path
 */
export const setupFormSchema = z.object({});

export type SetupFormValues = z.infer<typeof setupFormSchema>;

/**
 * Session form schema
 */
export const sessionFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  version: z.string().optional(),
});

export type SessionFormValues = z.infer<typeof sessionFormSchema>;

/**
 * API settings form schema
 */
export const apiSettingsFormSchema = z.object({
  openai_key: z.string().optional(),
});

export type ApiSettingsValues = z.infer<typeof apiSettingsFormSchema>;

/**
 * Crawler settings form schema
 */
export const crawlerSettingsFormSchema = z.object({
  prefix_path: z.string().min(1, "Prefix path is required").url("Must be a valid URL"),
  anti_paths: z.string().optional(),
  anti_keywords: z.string().optional(),
});

export type CrawlerSettingsValues = z.infer<typeof crawlerSettingsFormSchema>;

/**
 * Crawler URL form schema
 */
export const urlFormSchema = z.object({
  url: z.string().url("Must be a valid URL")
});

export type UrlFormValues = z.infer<typeof urlFormSchema>;

/**
 * Markdown cleanup form schema
 */
export const markdownCleanupFormSchema = z.object({
  model: z.enum(["gpt-4o-mini"]).default("gpt-4o-mini"),
  temperature: z.number().min(0).max(1).default(0.2),
  maxTokens: z.number().min(1).max(120000).default(120000),
});

export type MarkdownCleanupValues = z.infer<typeof markdownCleanupFormSchema>;