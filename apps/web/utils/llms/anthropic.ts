import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env.mjs";

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-haiku-20240307";

const anthropics: Record<string, Anthropic> = {};

export function getAnthropic(apiKey: string | null) {
  const key = apiKey || env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No API key provided");
  if (anthropics[key]) return anthropics[key];
  anthropics[key] = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropics[key];
}

export async function anthropicChatCompletion(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  const anthropic = getAnthropic(apiKey);

  return anthropic.messages.create({
    model,
    temperature: 0,
    messages,
    max_tokens: 2000, // TODO
  });
}

export async function anthropicChatCompletionStream(
  model: string,
  apiKey: string | null,
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  const anthropic = getAnthropic(apiKey);

  return anthropic.messages.create({
    model,
    temperature: 0,
    messages,
    max_tokens: 2000, // TODO
    stream: true,
  });
}
