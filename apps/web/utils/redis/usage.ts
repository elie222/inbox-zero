import "server-only";
import { z } from "zod";
import type { LanguageModelUsage } from "ai";
import { redis } from "@/utils/redis";

const usageSchema = z.object({
  openaiCalls: z.number().int().default(0),
  openaiTokensUsed: z.number().int().default(0),
  openaiCompletionTokensUsed: z.number().int().default(0),
  openaiPromptTokensUsed: z.number().int().default(0),
  cost: z.number().default(0),
});
type Usage = z.infer<typeof usageSchema>;

function getUsageKey(email: string) {
  return `usage:${email}`;
}

export async function getUsage(options: { email: string }) {
  const key = getUsageKey(options.email);
  const data = await redis.hgetall<Usage>(key);
  return data;
}

export async function saveUsage(options: {
  email: string;
  usage: LanguageModelUsage;
  cost: number;
}) {
  const { email, usage, cost } = options;
  console.log("🚀 ~ options:", JSON.stringify(options, null, 2));

  const key = getUsageKey(email);

  Promise.all([
    // TODO: this isn't openai specific, it can be any llm
    redis.hincrby(key, "openaiCalls", 1),
    redis.hincrby(key, "openaiTokensUsed", usage.totalTokens ?? 0),
    redis.hincrby(key, "openaiCompletionTokensUsed", usage.outputTokens ?? 0),
    redis.hincrby(key, "openaiPromptTokensUsed", usage.inputTokens ?? 0),
    redis.hincrby(key, "cachedInputTokensUsed", usage.cachedInputTokens ?? 0),
    redis.hincrby(key, "reasoningTokensUsed", usage.reasoningTokens ?? 0),

    redis.hincrbyfloat(key, "cost", cost),
  ]);
}
