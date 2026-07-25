import type { ToolSet } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { Provider } from "@/utils/llms/config";
import { getResolvedDeploymentRolePrimaryModelEntry } from "@/utils/llms/model";
import { LLM_USE_CASE_MODEL_TYPES, LlmUseCase } from "@/utils/llms/use-cases";

export type WebSearchConfig = {
  providerName: string;
  useOnlineVariant: boolean;
  getSearchTools?: () => ToolSet;
};

// The real web-search mechanism the deployment supports for the web-search
// model role: OpenAI and Google expose native search tools to generateText;
// OpenRouter instead uses its ":online" model variant. Null when the
// resolved provider has neither — callers then skip web research.
export function getWebSearchConfig(): WebSearchConfig | null {
  const webSearchProvider = getResolvedDeploymentRolePrimaryModelEntry(
    LLM_USE_CASE_MODEL_TYPES[LlmUseCase.MeetingWebSearch],
  )?.provider;

  switch (webSearchProvider) {
    case Provider.OPEN_AI:
      return {
        providerName: "OpenAI",
        useOnlineVariant: false,
        getSearchTools: () => ({ web_search: openai.tools.webSearch({}) }),
      };
    case Provider.GOOGLE:
      return {
        providerName: "Google",
        useOnlineVariant: false,
        getSearchTools: () => ({
          google_search: google.tools.googleSearch({}),
        }),
      };
    case Provider.OPENROUTER:
      return {
        providerName: "OpenRouter",
        useOnlineVariant: true,
      };
    default:
      return null;
  }
}
