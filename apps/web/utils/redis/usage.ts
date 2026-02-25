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

export type WeeklyUsageCostByEmail = {
  email: string;
  cost: number;
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
      return parseUsageCost(data?.cost);
    }),
  );

  return weeklyCosts.reduce((sum, value) => sum + value, 0);
}

export async function getTopWeeklyUsageCosts({
  limit = 20,
  now = new Date(),
}: {
  limit?: number;
  now?: Date;
} = {}): Promise<WeeklyUsageCostByEmail[]> {
  if (limit <= 0) return [];

  const daysInWindow = new Set(getWeeklyUsageCostDays(now));
  const costsByEmail = new Map<string, number>();
  let cursor = "0";

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: `${WEEKLY_USAGE_COST_KEY_PREFIX}:*`,
      count: 200,
    });
    cursor = String(nextCursor);

    const costEntries = await Promise.all(
      batch.map(async (key) => {
        const parsed = parseWeeklyUsageCostKey(key);
        if (!parsed || !daysInWindow.has(parsed.day)) return null;

        const data = await redis.hgetall<{ cost?: string | number }>(key);
        const cost = parseUsageCost(data?.cost);
        if (cost <= 0) return null;

        return { email: parsed.email, cost };
      }),
    );

    for (const entry of costEntries) {
      if (!entry) continue;
      costsByEmail.set(
        entry.email,
        (costsByEmail.get(entry.email) ?? 0) + entry.cost,
      );
    }
  } while (cursor !== "0");

  return Array.from(costsByEmail.entries())
    .map(([email, cost]) => ({ email, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

function getWeeklyUsageCostKeys(email: string, now: Date) {
  const days = getWeeklyUsageCostDays(now);
  return days.map((day) => getWeeklyUsageCostKey(email, day));
}

function getWeeklyUsageCostDays(now: Date) {
  return Array.from({ length: WEEKLY_USAGE_COST_DAYS }, (_, offsetDays) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offsetDays);
    return getUtcDay(date);
  });
}

function getWeeklyUsageCostKey(email: string, date: Date | string) {
  const day = typeof date === "string" ? date : getUtcDay(date);
  return `${WEEKLY_USAGE_COST_KEY_PREFIX}:${email}:${day}`;
}

function parseWeeklyUsageCostKey(key: string) {
  const prefix = `${WEEKLY_USAGE_COST_KEY_PREFIX}:`;
  if (!key.startsWith(prefix)) return null;

  const lastSeparatorIndex = key.lastIndexOf(":");
  if (lastSeparatorIndex <= prefix.length) return null;

  const email = key.slice(prefix.length, lastSeparatorIndex);
  const day = key.slice(lastSeparatorIndex + 1);
  if (!email || !day) return null;

  return { email, day };
}

function parseUsageCost(rawCost: string | number | undefined): number {
  if (typeof rawCost === "number") return rawCost;
  if (typeof rawCost === "string") return Number.parseFloat(rawCost) || 0;
  return 0;
}

function getUtcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
