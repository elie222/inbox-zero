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

export type WeeklyUsageCostBySubject = {
  email?: string;
  userId?: string;
  cost: number;
};

type UsageIdentity =
  | { userId: string; email?: string | null }
  | { userId?: string | null; email: string };

function getUsageKey(identity: UsageIdentity) {
  return identity.userId
    ? `usage:user:${identity.userId}`
    : `usage:${identity.email}`;
}

export async function getUsage(options: UsageIdentity) {
  const data = await redis.hgetall<RedisUsage>(getUsageKey(options));
  if (!options.userId || !options.email) return data;

  const legacyData = await redis.hgetall<RedisUsage>(
    getUsageKey({ email: options.email }),
  );
  return mergeUsage(data, legacyData);
}

export async function saveUsage(
  options: UsageIdentity & {
    usage: LanguageModelUsage;
    cost: number;
    now?: Date;
  },
) {
  const { usage, cost, now = new Date() } = options;

  const key = getUsageKey(options);
  const weeklyCostKey = getWeeklyUsageCostKey(options, now);

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
  userId,
  email,
  fallbackEmails = [],
  now = new Date(),
}: {
  userId?: string;
  email?: string;
  fallbackEmails?: string[];
  now?: Date;
}) {
  const usageKeys = [
    ...(userId ? getWeeklyUsageCostKeys({ userId }, now) : []),
    ...dedupe([email, ...fallbackEmails].filter(Boolean) as string[]).flatMap(
      (legacyEmail) => getWeeklyUsageCostKeys({ email: legacyEmail }, now),
    ),
  ];

  if (!usageKeys.length) return 0;

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
} = {}): Promise<WeeklyUsageCostBySubject[]> {
  if (limit <= 0) return [];

  const daysInWindow = new Set(getWeeklyUsageCostDays(now));
  const costsBySubject = new Map<string, number>();
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

        return { ...parsed, cost };
      }),
    );

    for (const entry of costEntries) {
      if (!entry) continue;
      costsBySubject.set(
        entry.subject,
        (costsBySubject.get(entry.subject) ?? 0) + entry.cost,
      );
    }
  } while (cursor !== "0");

  return Array.from(costsBySubject.entries())
    .map(([subject, cost]) => {
      if (subject.startsWith("user:")) {
        return { userId: subject.slice("user:".length), cost };
      }
      return { email: subject.slice("email:".length), cost };
    })
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

function getWeeklyUsageCostKeys(identity: UsageIdentity, now: Date) {
  const days = getWeeklyUsageCostDays(now);
  return days.map((day) => getWeeklyUsageCostKey(identity, day));
}

function getWeeklyUsageCostDays(now: Date) {
  return Array.from({ length: WEEKLY_USAGE_COST_DAYS }, (_, offsetDays) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offsetDays);
    return getUtcDay(date);
  });
}

function getWeeklyUsageCostKey(identity: UsageIdentity, date: Date | string) {
  const day = typeof date === "string" ? date : getUtcDay(date);
  if (identity.userId) {
    return `${WEEKLY_USAGE_COST_KEY_PREFIX}:user:${identity.userId}:${day}`;
  }
  return `${WEEKLY_USAGE_COST_KEY_PREFIX}:${identity.email}:${day}`;
}

function parseWeeklyUsageCostKey(key: string) {
  const prefix = `${WEEKLY_USAGE_COST_KEY_PREFIX}:`;
  if (!key.startsWith(prefix)) return null;

  if (key.startsWith(`${prefix}user:`)) {
    const userPrefix = `${prefix}user:`;
    const lastSeparatorIndex = key.lastIndexOf(":");
    if (lastSeparatorIndex <= userPrefix.length) return null;

    const userId = key.slice(userPrefix.length, lastSeparatorIndex);
    const day = key.slice(lastSeparatorIndex + 1);
    if (!userId || !day) return null;

    return { subject: `user:${userId}`, userId, day };
  }

  const lastSeparatorIndex = key.lastIndexOf(":");
  if (lastSeparatorIndex <= prefix.length) return null;

  const email = key.slice(prefix.length, lastSeparatorIndex);
  const day = key.slice(lastSeparatorIndex + 1);
  if (!email || !day) return null;

  return { subject: `email:${email}`, email, day };
}

function parseUsageCost(rawCost: string | number | undefined): number {
  if (typeof rawCost === "number") return rawCost;
  if (typeof rawCost === "string") return Number.parseFloat(rawCost) || 0;
  return 0;
}

function getUtcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mergeUsage(
  ...entries: Array<RedisUsage | null | undefined>
): RedisUsage {
  const merged: RedisUsage = {};

  for (const entry of entries) {
    if (!entry) continue;
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value !== "number") continue;
      const usageKey = key as keyof RedisUsage;
      merged[usageKey] = (merged[usageKey] ?? 0) + value;
    }
  }

  return merged;
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}
