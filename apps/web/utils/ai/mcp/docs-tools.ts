import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { searchDocsIndex } from "@/utils/docs-sources/docs-index";
import {
  DocsFetchError,
  getDocsIndex,
  readDocsPage,
} from "@/utils/docs-sources/fetch-docs";
import type { Logger } from "@/utils/logger";

export function createDocsTools(sources: string[], logger: Logger): ToolSet {
  if (!sources.length) return {};

  const sites = sources.join(", ");

  return {
    search_docs: tool({
      description: `Search the user's public documentation (${sites}) for pages about a topic. Returns page titles and URLs; read a page with read_docs_page before relying on it.`,
      inputSchema: z.object({
        query: z
          .string()
          .describe("A few keywords for the topic, such as a feature name."),
      }),
      execute: async ({ query }) => {
        try {
          const entries = searchDocsIndex(await getDocsIndex(sources), query);
          if (!entries.length) {
            return "No matching pages found in the docs index. Try other keywords, or read a docs URL directly with read_docs_page.";
          }
          return entries
            .map(
              (entry) =>
                `- ${entry.title}: ${entry.url}${entry.description ? ` (${entry.description})` : ""}`,
            )
            .join("\n");
        } catch (error) {
          logger.warn("Docs search failed", { error });
          return "Docs search failed.";
        }
      },
    }),
    read_docs_page: tool({
      description: `Read a page from the user's public documentation and return its text and links. Only URLs under ${sites} are allowed.`,
      inputSchema: z.object({
        url: z.string().describe("Full https URL of the docs page."),
      }),
      execute: async ({ url }) => {
        try {
          return await readDocsPage(url, sources);
        } catch (error) {
          if (error instanceof DocsFetchError) return error.message;
          logger.warn("Docs page read failed", { error });
          return "Could not read that page.";
        }
      },
    }),
  };
}
