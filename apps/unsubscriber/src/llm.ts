import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { bedrock } from "@ai-sdk/amazon-bedrock";

type LLMProvider = "google" | "openai" | "anthropic" | "bedrock";

export function getModel(provider: LLMProvider) {
  switch (provider) {
    case "google":
      return google("gemini-2.5-flash");
    case "openai":
      return openai("gpt-5-mini");
    case "anthropic":
      return anthropic("claude-sonnet-4-5-20250929");
    case "bedrock":
      return bedrock("anthropic.claude-3-7-sonnet-20250219-v1:0");
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
