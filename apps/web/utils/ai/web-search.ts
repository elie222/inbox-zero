import type { JSONValue, ToolSet } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { Provider } from "@/utils/llms/config";

export type WebSearchConfig = {
  providerName: string;
  tools?: ToolSet;
  providerOptions?: Record<string, Record<string, JSONValue>>;
};

export function getWebSearchConfigForProvider(
  provider: string | undefined,
): WebSearchConfig | null {
  switch (provider) {
    case Provider.OPEN_AI:
      return {
        providerName: "OpenAI",
        tools: { web_search: openai.tools.webSearch({}) },
      };
    case Provider.GOOGLE:
      return {
        providerName: "Google",
        tools: { google_search: google.tools.googleSearch({}) },
      };
    case Provider.OPENROUTER:
      return {
        providerName: "OpenRouter",
        // The web plugin always runs one search before the model answers. The
        // server-side web_search tool can't be forced: AI SDK 7 rejects
        // toolChoice "required" because the call never reaches the client.
        providerOptions: {
          openrouter: { plugins: [{ id: "web", max_results: 5 }] },
        },
      };
    default:
      return null;
  }
}
