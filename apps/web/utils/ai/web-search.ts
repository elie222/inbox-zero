import type { ProviderOptions, ToolSet } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { Provider } from "@/utils/llms/config";

export type WebSearchConfig = {
  providerName: string;
  tools: ToolSet;
  providerOptions?: ProviderOptions;
  toolChoice?: "required";
};

export function hasWebSearchForProvider(provider: string | undefined) {
  return (
    provider === Provider.OPEN_AI ||
    provider === Provider.GOOGLE ||
    provider === Provider.OPENROUTER
  );
}

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
        tools: {
          web_search: openrouter.tools.webSearch({
            engine: "auto",
            maxResults: 5,
          }),
        },
        providerOptions: { openrouter: { max_tool_calls: 1 } },
        toolChoice: "required",
      };
    default:
      return null;
  }
}
