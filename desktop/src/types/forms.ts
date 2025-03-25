import { z } from "zod";

/**
 * Setup form schema - No longer requires ChromaDB path
 */
export const setupFormSchema = z.object({});

export type SetupFormValues = z.infer<typeof setupFormSchema>;

/**
 * Crawler settings form schema
 */
export const crawlerSettingsFormSchema = z.object({
  prefixPath: z.string().min(1, "Prefix path is required").url("Must be a valid URL"),
  antiPaths: z.string().optional(),
  antiKeywords: z.string().optional(),
});

export type CrawlerSettingsValues = z.infer<typeof crawlerSettingsFormSchema>;