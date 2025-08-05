import "server-only";
import type { LanguageModelUsage } from "ai";
import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("redis/usage");

export type RedisUsage = {
  openaiCalls?: number;
  openaiTokensUsed?: number;
  openaiCompletionTokensUsed?: number;
  openaiPromptTokensUsed?: number;
  cachedInputTokensUsed?: number;
  reasoningTokensUsed?: number;
  cost?: number;
};

function getUsageKey(email: string) {
  return `usage:${email}`;
}

export async function getUsage(options: { email: string }) {
  const key = getUsageKey(options.email);
  const data = await redis.hgetall<RedisUsage>(key);
  return data;
}

export async function saveUsage(options: {
  email: string;
  usage: LanguageModelUsage;
  cost: number;
}) {
  const { email, usage, cost } = options;

  const key = getUsageKey(email);

  await Promise.all([
    // TODO: this isn't openai specific, it can be any llm
    redis.hincrby(key, "openaiCalls", 1),
    usage.totalTokens
      ? redis.hincrby(key, "openaiTokensUsed", usage.totalTokens)
      : null,
    usage.outputTokens
      ? redis.hincrby(key, "openaiCompletionTokensUsed", usage.outputTokens)
      : null,
    usage.inputTokens
      ? redis.hincrby(key, "openaiPromptTokensUsed", usage.inputTokens)
      : null,
    usage.cachedInputTokens
      ? redis.hincrby(key, "cachedInputTokensUsed", usage.cachedInputTokens)
      : null,
    usage.reasoningTokens
      ? redis.hincrby(key, "reasoningTokensUsed", usage.reasoningTokens)
      : null,
    cost ? redis.hincrbyfloat(key, "cost", cost) : null,
  ]).catch((error) => {
    logger.error("Error saving usage", { error: error.message, cost, usage });
  });
}
