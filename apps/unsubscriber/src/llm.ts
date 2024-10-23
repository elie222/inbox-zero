import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { bedrock } from "@ai-sdk/amazon-bedrock";

type LLMProvider = "google" | "openai" | "anthropic" | "bedrock";

export function getModel(provider: LLMProvider) {
  switch (provider) {
    case "google":
      return google("gemini-1.5-flash");
    case "openai":
      return openai("gpt-4o-mini");
    case "anthropic":
      return anthropic("claude-3-5-sonnet-20241022");
    case "bedrock":
      return bedrock("anthropic.claude-3-5-sonnet-20241022-v2:0");
  }
}
