import "server-only";
import type { LanguageModelUsage } from "ai";
import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("redis/usage");
const WEEKLY_USAGE_COST_DAYS = 7;
const WEEKLY_USAGE_COST_TTL_SECONDS = 8 * 24 * 60 * 60;
const WEEKLY_USAGE_COST_KEY_PREFIX = "usage-weekly-cost";

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
  now?: Date;
}) {
  const { email, usage, cost, now = new Date() } = options;

  const key = getUsageKey(email);
  const weeklyCostKey = getWeeklyUsageCostKey(email, now);

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
    cost ? redis.hincrbyfloat(weeklyCostKey, "cost", cost) : null,
    cost ? redis.expire(weeklyCostKey, WEEKLY_USAGE_COST_TTL_SECONDS) : null,
  ]).catch((error) => {
    logger.error("Error saving usage", { error: error.message, cost, usage });
  });
}

export async function getWeeklyUsageCost({
  email,
  now = new Date(),
}: {
  email: string;
  now?: Date;
}) {
  const usageKeys = getWeeklyUsageCostKeys(email, now);

  const weeklyCosts = await Promise.all(
    usageKeys.map(async (key) => {
      const data = await redis.hgetall<{ cost?: string | number }>(key);
      const rawCost = data?.cost;
      if (typeof rawCost === "number") return rawCost;
      if (typeof rawCost === "string") return Number.parseFloat(rawCost) || 0;
      return 0;
    }),
  );

  return weeklyCosts.reduce((sum, value) => sum + value, 0);
}

function getWeeklyUsageCostKeys(email: string, now: Date) {
  return Array.from({ length: WEEKLY_USAGE_COST_DAYS }, (_, offsetDays) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offsetDays);
    return getWeeklyUsageCostKey(email, date);
  });
}

function getWeeklyUsageCostKey(email: string, date: Date) {
  return `${WEEKLY_USAGE_COST_KEY_PREFIX}:${email}:${getUtcDay(date)}`;
}

function getUtcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
