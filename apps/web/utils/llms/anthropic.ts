import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env.mjs";

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
  messages: Array<{
    role: "assistant" | "user";
    content: string;
  }>,
) {
  const anthropic = getAnthropic(null);

  return anthropic.messages.create({
    model,
    temperature: 0,
    messages,
    max_tokens: 2000, // TODO
  });
}
