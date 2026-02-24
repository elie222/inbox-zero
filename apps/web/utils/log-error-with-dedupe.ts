import { createHash } from "node:crypto";
import { env } from "@/env";
import { getErrorMessage } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";

type DedupeValue = string | number | boolean | null | undefined;

type DedupeLogInput = {
  logger: Logger;
  message: string;
  error?: unknown;
  context?: Record<string, unknown>;
  dedupeKeyParts: Record<string, DedupeValue>;
  ttlSeconds?: number;
  summaryIntervalSeconds?: number;
  enabled?: boolean;
};

const DEFAULT_TTL_SECONDS = 5 * 60;
const DEFAULT_SUMMARY_INTERVAL_SECONDS = 60;
const KEY_PREFIX = "log-dedupe:v1";

export async function logErrorWithDedupe({
  logger,
  message,
  error,
  context,
  dedupeKeyParts,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  summaryIntervalSeconds = DEFAULT_SUMMARY_INTERVAL_SECONDS,
  enabled = true,
}: DedupeLogInput): Promise<void> {
  if (!enabled) {
    logger.error(message, { ...context, error });
    return;
  }

  const dedupeKey = createDedupeKey({
    message,
    error,
    dedupeKeyParts,
  });

  const decision = await getDedupeDecision({
    dedupeKey,
    ttlSeconds,
    summaryIntervalSeconds,
  });

  if (decision.type === "suppress") {
    return;
  }

  const payload: Record<string, unknown> = {
    ...context,
    dedupeKey,
    deduped: decision.type !== "pass",
  };

  if (decision.type === "summary") {
    payload.suppressedCount = decision.suppressedCount;
    payload.lastError = getErrorMessage(error);
    logger.error(message, payload);
    return;
  }

  logger.error(message, {
    ...payload,
    error,
  });
}

type DedupeDecision =
  | { type: "pass" }
  | { type: "summary"; suppressedCount: number }
  | { type: "suppress" };

async function getDedupeDecision({
  dedupeKey,
  ttlSeconds,
  summaryIntervalSeconds,
}: {
  dedupeKey: string;
  ttlSeconds: number;
  summaryIntervalSeconds: number;
}): Promise<DedupeDecision> {
  if (!isRedisDedupeEnabled()) {
    return { type: "pass" };
  }

  const seenKey = `${KEY_PREFIX}:seen:${dedupeKey}`;
  const summaryLockKey = `${KEY_PREFIX}:summary:${dedupeKey}`;
  const suppressedCountKey = `${KEY_PREFIX}:count:${dedupeKey}`;
  const counterTtlSeconds = ttlSeconds + summaryIntervalSeconds;

  try {
    const firstSeen = await redis.set(seenKey, "1", {
      ex: ttlSeconds,
      nx: true,
    });
    if (firstSeen === "OK") {
      await redis.set(suppressedCountKey, "0", { ex: counterTtlSeconds });
      return { type: "pass" };
    }

    const suppressedCount = Number(await redis.incr(suppressedCountKey));
    await redis.expire(suppressedCountKey, counterTtlSeconds);

    const summaryLock = await redis.set(summaryLockKey, "1", {
      ex: summaryIntervalSeconds,
      nx: true,
    });

    if (summaryLock === "OK") {
      return { type: "summary", suppressedCount };
    }

    return { type: "suppress" };
  } catch {
    return { type: "pass" };
  }
}

function createDedupeKey({
  message,
  error,
  dedupeKeyParts,
}: {
  message: string;
  error?: unknown;
  dedupeKeyParts: Record<string, DedupeValue>;
}) {
  const sortedKeyParts = Object.fromEntries(
    Object.entries(dedupeKeyParts)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

  const keyPayload = JSON.stringify({
    message,
    keyParts: sortedKeyParts,
    errorFingerprint: getErrorFingerprint(error),
  });

  return createHash("sha256").update(keyPayload).digest("hex").slice(0, 24);
}

function getErrorFingerprint(error: unknown) {
  if (!error) return "none";

  const topLevel = asRecord(error);
  const nestedError = asRecord(topLevel?.error);

  const name =
    getString(topLevel, "name") ?? getString(nestedError, "name") ?? "unknown";
  const code =
    getString(topLevel, "code") ??
    getString(nestedError, "code") ??
    getString(topLevel, "statusCode") ??
    getString(nestedError, "statusCode") ??
    getString(topLevel, "status") ??
    getString(nestedError, "status") ??
    "none";
  const message = (getErrorMessage(error) ?? "").toLowerCase().slice(0, 200);

  return `${name}|${code}|${message}`;
}

function isRedisDedupeEnabled() {
  if (env.NODE_ENV === "test") return false;

  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function getString(
  value: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const result = value?.[key];
  if (typeof result === "string") return result;
  if (typeof result === "number") return result.toString();
  return undefined;
}
