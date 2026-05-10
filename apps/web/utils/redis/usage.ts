import "server-only";
import type { LanguageModelUsage } from "ai";
import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("redis/usage");
const WEEKLY_USAGE_COST_DAYS = 7;
const WEEKLY_USAGE_COST_TTL_SECONDS = 8 * 24 * 60 * 60;
const WEEKLY_USAGE_COST_KEY_PREFIX = "usage-weekly-cost";
const USAGE_MIGRATION_LOCK_TTL_SECONDS = 5 * 60;

export type RedisUsage = {
  openaiCalls?: number;
  openaiTokensUsed?: number;
  openaiCompletionTokensUsed?: number;
  openaiPromptTokensUsed?: number;
  cachedInputTokensUsed?: number;
  reasoningTokensUsed?: number;
  cost?: number;
};

const usageFields = [
  "openaiCalls",
  "openaiTokensUsed",
  "openaiCompletionTokensUsed",
  "openaiPromptTokensUsed",
  "cachedInputTokensUsed",
  "reasoningTokensUsed",
  "cost",
] as const satisfies Array<keyof RedisUsage>;

export type WeeklyUsageCostBySubject =
  | { userId: string; cost: number }
  | { email: string; cost: number };

type UsageKeyIdentity =
  | { type: "email-account"; id: string }
  | { type: "user"; id: string };

function getUsageKey(identity: UsageKeyIdentity) {
  return `usage:${identity.type}:${identity.id}`;
}

export async function getUsage(options: {
  emailAccountId: string;
  legacyEmail?: string | null;
  userId?: string | null;
}) {
  const emailAccountUsageKey = getUsageKey({
    type: "email-account",
    id: options.emailAccountId,
  });
  const userUsageKey = options.userId
    ? getUsageKey({ type: "user", id: options.userId })
    : null;

  if (!options.legacyEmail) {
    return redis.hgetall<RedisUsage>(emailAccountUsageKey);
  }

  const legacyUsageKey = getLegacyUsageKey(options.legacyEmail);
  const migrationName = `usage-email-account:${options.emailAccountId}`;
  const doneKey = getUsageMigrationDoneKey(migrationName);
  const lockKey = getUsageMigrationLockKey(migrationName);
  const rawMigrationState = await redis.get(doneKey);
  const migratedLegacyUsage = parseLegacyUsageMigrationState(rawMigrationState);

  if (migratedLegacyUsage) {
    const [currentUsage, legacyUsage] = await Promise.all([
      redis.hgetall<RedisUsage>(emailAccountUsageKey),
      redis.hgetall<RedisUsage>(legacyUsageKey),
    ]);
    const legacyDelta = getUsageDelta(legacyUsage, migratedLegacyUsage);

    if (hasUsageData(legacyDelta)) {
      const claimedLock = await redis.set(lockKey, new Date().toISOString(), {
        nx: true,
        ex: USAGE_MIGRATION_LOCK_TTL_SECONDS,
      });

      if (!claimedLock) return mergeUsage(currentUsage, legacyDelta);

      try {
        const [latestCurrentUsage, latestLegacyUsage, latestRawMigrationState] =
          await Promise.all([
            redis.hgetall<RedisUsage>(emailAccountUsageKey),
            redis.hgetall<RedisUsage>(legacyUsageKey),
            redis.get(doneKey),
          ]);
        const latestMigratedLegacyUsage = parseLegacyUsageMigrationState(
          latestRawMigrationState,
        );

        if (!latestMigratedLegacyUsage) {
          return maxUsage(latestCurrentUsage, latestLegacyUsage);
        }

        const latestLegacyDelta = getUsageDelta(
          latestLegacyUsage,
          latestMigratedLegacyUsage,
        );

        if (hasUsageData(latestLegacyDelta)) {
          await Promise.all([
            ...getUsageDataIncrementOperations(
              emailAccountUsageKey,
              latestLegacyDelta,
            ),
            ...(userUsageKey
              ? getUsageDataIncrementOperations(userUsageKey, latestLegacyDelta)
              : []),
            redis.set(
              doneKey,
              JSON.stringify({ usage: latestLegacyUsage ?? {} }),
            ),
          ]);
        }

        return mergeUsage(latestCurrentUsage, latestLegacyDelta);
      } catch (error) {
        logger.error("Failed to migrate legacy usage delta", {
          migrationName,
          error,
        });
      } finally {
        try {
          await redis.del(lockKey);
        } catch (error) {
          logger.error("Failed to clear usage migration lock", {
            migrationName,
            error,
          });
        }
      }
    }

    return mergeUsage(currentUsage, legacyDelta);
  }

  if (rawMigrationState) {
    const [currentUsage, legacyUsage] = await Promise.all([
      redis.hgetall<RedisUsage>(emailAccountUsageKey),
      redis.hgetall<RedisUsage>(legacyUsageKey),
    ]);
    return maxUsage(currentUsage, legacyUsage);
  }

  const claimedLock = await redis.set(lockKey, new Date().toISOString(), {
    nx: true,
    ex: USAGE_MIGRATION_LOCK_TTL_SECONDS,
  });
  const [currentUsage, legacyUsage] = await Promise.all([
    redis.hgetall<RedisUsage>(emailAccountUsageKey),
    redis.hgetall<RedisUsage>(legacyUsageKey),
  ]);

  if (!claimedLock) return mergeUsage(currentUsage, legacyUsage);

  try {
    await Promise.all([
      ...getUsageDataIncrementOperations(emailAccountUsageKey, legacyUsage),
      ...(userUsageKey
        ? getUsageDataIncrementOperations(userUsageKey, legacyUsage)
        : []),
      redis.set(doneKey, JSON.stringify({ usage: legacyUsage ?? {} })),
    ]);

    return redis.hgetall<RedisUsage>(emailAccountUsageKey);
  } catch (error) {
    logger.error("Failed to migrate legacy usage", {
      migrationName,
      error,
    });
    return mergeUsage(currentUsage, legacyUsage);
  } finally {
    try {
      await redis.del(lockKey);
    } catch (error) {
      logger.error("Failed to clear usage migration lock", {
        migrationName,
        error,
      });
    }
  }
}

export async function saveUsage(options: {
  userId?: string | null;
  emailAccountId: string;
  usage: LanguageModelUsage;
  cost: number;
  now?: Date;
}) {
  const { userId, emailAccountId, usage, cost, now = new Date() } = options;

  const usageKeys = [
    getUsageKey({ type: "email-account", id: emailAccountId }),
    ...(userId ? [getUsageKey({ type: "user", id: userId })] : []),
  ];
  const weeklyCostKey = userId ? getWeeklyUsageCostKey(userId, now) : null;

  await Promise.all([
    ...usageKeys.flatMap((key) =>
      getUsageIncrementOperations(key, usage, cost),
    ),
    cost && weeklyCostKey
      ? redis.hincrbyfloat(weeklyCostKey, "cost", cost)
      : null,
    cost && weeklyCostKey
      ? redis.expire(weeklyCostKey, WEEKLY_USAGE_COST_TTL_SECONDS)
      : null,
  ]).catch((error) => {
    logger.error("Error saving usage", { error: error.message, cost, usage });
  });
}

export async function getWeeklyUsageCost({
  userId,
  legacyEmails = [],
  now = new Date(),
}: {
  userId: string;
  legacyEmails?: string[];
  now?: Date;
}) {
  const usageKeys = getWeeklyUsageCostKeys(userId, now);
  const uniqueLegacyEmails = Array.from(new Set(legacyEmails));
  const legacyCostsByKey = uniqueLegacyEmails.length
    ? await getLegacyWeeklyUsageCostsByKey({ emails: uniqueLegacyEmails, now })
    : new Map<string, number>();

  const migratedCost = await getWeeklyUsageCostTotal(usageKeys);
  if (!uniqueLegacyEmails.length) return migratedCost;

  const migrationName = `weekly-usage-cost-user:${userId}`;
  const doneKey = getUsageMigrationDoneKey(migrationName);
  const lockKey = getUsageMigrationLockKey(migrationName);
  const rawMigrationState = await redis.get(doneKey);
  const migratedLegacyCosts = parseWeeklyUsageMigrationState(rawMigrationState);

  if (migratedLegacyCosts) {
    const legacyDeltaByKey = getLegacyWeeklyCostDelta(
      legacyCostsByKey,
      migratedLegacyCosts,
    );
    const legacyDelta = sumMapValues(legacyDeltaByKey);

    if (legacyDelta > 0) {
      const claimedLock = await redis.set(lockKey, new Date().toISOString(), {
        nx: true,
        ex: USAGE_MIGRATION_LOCK_TTL_SECONDS,
      });

      if (!claimedLock) return migratedCost + legacyDelta;

      try {
        const [
          latestLegacyCostsByKey,
          latestMigratedCost,
          latestRawMigrationState,
        ] = await Promise.all([
          getLegacyWeeklyUsageCostsByKey({
            emails: uniqueLegacyEmails,
            now,
          }),
          getWeeklyUsageCostTotal(usageKeys),
          redis.get(doneKey),
        ]);
        const latestMigratedLegacyCosts = parseWeeklyUsageMigrationState(
          latestRawMigrationState,
        );

        if (!latestMigratedLegacyCosts) {
          return Math.max(
            latestMigratedCost,
            sumMapValues(latestLegacyCostsByKey),
          );
        }

        const latestLegacyDeltaByKey = getLegacyWeeklyCostDelta(
          latestLegacyCostsByKey,
          latestMigratedLegacyCosts,
        );
        const latestLegacyDelta = sumMapValues(latestLegacyDeltaByKey);

        if (latestLegacyDelta > 0) {
          await Promise.all([
            ...getWeeklyCostIncrementOperations(userId, latestLegacyDeltaByKey),
            redis.set(
              doneKey,
              JSON.stringify({
                weeklyCosts: Object.fromEntries(latestLegacyCostsByKey),
              }),
            ),
          ]);
        }

        return latestMigratedCost + latestLegacyDelta;
      } catch (error) {
        logger.error("Failed to migrate legacy weekly usage delta", {
          migrationName,
          error,
        });
      } finally {
        try {
          await redis.del(lockKey);
        } catch (error) {
          logger.error("Failed to clear weekly usage migration lock", {
            migrationName,
            error,
          });
        }
      }
    }

    return migratedCost + legacyDelta;
  }

  if (rawMigrationState) {
    return Math.max(migratedCost, sumMapValues(legacyCostsByKey));
  }

  const claimedLock = await redis.set(lockKey, new Date().toISOString(), {
    nx: true,
    ex: USAGE_MIGRATION_LOCK_TTL_SECONDS,
  });

  if (!claimedLock) return migratedCost + sumMapValues(legacyCostsByKey);

  try {
    await Promise.all([
      ...getWeeklyCostIncrementOperations(userId, legacyCostsByKey),
      redis.set(
        doneKey,
        JSON.stringify({ weeklyCosts: Object.fromEntries(legacyCostsByKey) }),
      ),
    ]);
  } catch (error) {
    logger.error("Failed to migrate legacy weekly usage", {
      migrationName,
      error,
    });
    return migratedCost + sumMapValues(legacyCostsByKey);
  } finally {
    try {
      await redis.del(lockKey);
    } catch (error) {
      logger.error("Failed to clear weekly usage migration lock", {
        migrationName,
        error,
      });
    }
  }

  const updatedWeeklyCost = await getWeeklyUsageCostTotal(usageKeys);

  return Math.max(updatedWeeklyCost, sumMapValues(legacyCostsByKey));
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
        const cost = parseRedisNumber(data?.cost);
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

function getUsageIncrementOperations(
  key: string,
  usage: LanguageModelUsage,
  cost: number,
) {
  return [
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
  ];
}

function getUsageDataIncrementOperations(
  key: string,
  usage: RedisUsage | null,
) {
  if (!usage) return [];

  return usageFields.flatMap((field) => {
    const value = parseRedisNumber(usage[field]);
    if (value <= 0) return [];
    if (field === "cost") return [redis.hincrbyfloat(key, field, value)];
    return [redis.hincrby(key, field, value)];
  });
}

function getUsageDelta(
  legacyUsage: RedisUsage | null,
  migratedLegacyUsage: RedisUsage,
) {
  const delta: RedisUsage = {};

  for (const field of usageFields) {
    const legacyValue = parseRedisNumber(legacyUsage?.[field]);
    const migratedValue = parseRedisNumber(migratedLegacyUsage[field]);
    const value = legacyValue - migratedValue;
    if (value > 0) delta[field] = value;
  }

  return delta;
}

function hasUsageData(usage: RedisUsage | null | undefined) {
  return usageFields.some((field) => parseRedisNumber(usage?.[field]) > 0);
}

async function getWeeklyUsageCostTotal(keys: string[]) {
  const weeklyCosts = await Promise.all(
    keys.map(async (key) => {
      const data = await redis.hgetall<{ cost?: string | number }>(key);
      return parseRedisNumber(data?.cost);
    }),
  );

  return weeklyCosts.reduce((sum, value) => sum + value, 0);
}

function getWeeklyUsageCostKeys(userId: string, now: Date) {
  const days = getWeeklyUsageCostDays(now);
  return days.map((day) => getWeeklyUsageCostKey(userId, day));
}

function getWeeklyUsageCostDays(now: Date) {
  return Array.from({ length: WEEKLY_USAGE_COST_DAYS }, (_, offsetDays) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offsetDays);
    return getUtcDay(date);
  });
}

function getWeeklyUsageCostKey(userId: string, date: Date | string) {
  const day = typeof date === "string" ? date : getUtcDay(date);
  return `${WEEKLY_USAGE_COST_KEY_PREFIX}:user:${userId}:${day}`;
}

function getLegacyUsageKey(email: string) {
  return `usage:${email}`;
}

function getLegacyWeeklyUsageCostKey(email: string, date: Date | string) {
  const day = typeof date === "string" ? date : getUtcDay(date);
  return `${WEEKLY_USAGE_COST_KEY_PREFIX}:${email}:${day}`;
}

async function getLegacyWeeklyUsageCostsByKey({
  emails,
  now,
}: {
  emails: string[];
  now: Date;
}) {
  const costsByKey = new Map<string, number>();
  if (!emails.length) return costsByKey;

  await Promise.all(
    emails.flatMap((email) =>
      getWeeklyUsageCostDays(now).map(async (day) => {
        const key = getLegacyWeeklyUsageCostKey(email, day);
        const data = await redis.hgetall<{ cost?: string | number }>(key);
        const cost = parseRedisNumber(data?.cost);
        if (cost > 0) costsByKey.set(key, cost);
      }),
    ),
  );

  return costsByKey;
}

function parseWeeklyUsageCostKey(key: string) {
  const prefix = `${WEEKLY_USAGE_COST_KEY_PREFIX}:`;
  if (!key.startsWith(prefix)) return null;

  const userPrefix = `${prefix}user:`;
  if (key.startsWith(userPrefix)) {
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

function parseRedisNumber(raw: string | number | undefined): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number.parseFloat(raw) || 0;
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
    for (const field of usageFields) {
      const value = parseRedisNumber(entry[field]);
      if (value <= 0) continue;
      merged[field] = (merged[field] ?? 0) + value;
    }
  }

  return merged;
}

function maxUsage(
  currentUsage: RedisUsage | null | undefined,
  legacyUsage: RedisUsage | null | undefined,
) {
  const usage: RedisUsage = {};

  for (const field of usageFields) {
    const value = Math.max(
      parseRedisNumber(currentUsage?.[field]),
      parseRedisNumber(legacyUsage?.[field]),
    );
    if (value > 0) usage[field] = value;
  }

  return usage;
}

function getWeeklyCostIncrementOperations(
  userId: string,
  legacyCostsByKey: Map<string, number>,
) {
  return Array.from(legacyCostsByKey.entries()).flatMap(([key, cost]) => {
    const parsed = parseWeeklyUsageCostKey(key);
    if (!parsed) return [];

    const weeklyCostKey = getWeeklyUsageCostKey(userId, parsed.day);
    return [
      redis.hincrbyfloat(weeklyCostKey, "cost", cost),
      redis.expire(weeklyCostKey, WEEKLY_USAGE_COST_TTL_SECONDS),
    ];
  });
}

function getLegacyWeeklyCostDelta(
  legacyCostsByKey: Map<string, number>,
  migratedLegacyCostsByKey: Map<string, number>,
) {
  const delta = new Map<string, number>();

  for (const [key, cost] of legacyCostsByKey.entries()) {
    const value = cost - (migratedLegacyCostsByKey.get(key) ?? 0);
    if (value > 0) delta.set(key, value);
  }

  return delta;
}

function sumMapValues(map: Map<string, number>) {
  return Array.from(map.values()).reduce((sum, value) => sum + value, 0);
}

function getUsageMigrationDoneKey(migrationName: string) {
  return `usage-migration:${migrationName}:done`;
}

function getUsageMigrationLockKey(migrationName: string) {
  return `usage-migration:${migrationName}:lock`;
}

function parseLegacyUsageMigrationState(rawState: unknown): RedisUsage | null {
  if (typeof rawState !== "string") return null;

  try {
    const parsed = JSON.parse(rawState) as { usage?: RedisUsage };
    return parsed.usage ?? null;
  } catch {
    return null;
  }
}

function parseWeeklyUsageMigrationState(
  rawState: unknown,
): Map<string, number> | null {
  if (typeof rawState !== "string") return null;

  try {
    const parsed = JSON.parse(rawState) as {
      weeklyCosts?: Record<string, string | number>;
    };
    if (!parsed.weeklyCosts) return null;

    return new Map(
      Object.entries(parsed.weeklyCosts).flatMap(([key, value]) => {
        const cost = parseRedisNumber(value);
        return cost > 0 ? [[key, cost]] : [];
      }),
    );
  } catch {
    return null;
  }
}
