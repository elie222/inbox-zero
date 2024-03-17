import { anthropicChatCompletion } from "@/utils/llms/anthropic";
import { openAIChatCompletion } from "@/utils/llms/openai";

export const DEFAULT_AI_PROVIDER = "openai";
export const DEFAULT_AI_MODEL = "gpt-4-turbo-preview";

export async function chatCompletion(
  provider: "openai" | "anthropic" | null,
  model: string,
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  if (provider === "openai") return openAIChatCompletion(model, messages);
  if (provider === "anthropic") return anthropicChatCompletion(model, messages);

  throw new Error("AI provider not supported");
}
