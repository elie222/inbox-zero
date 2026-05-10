import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/env";
import { redis } from "@/utils/redis";
import type { Logger } from "@/utils/logger";

type RateLimitRule = {
  key: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult =
  | {
      limited: false;
      limit: number;
      remaining: number;
    }
  | {
      limited: true;
      limit: number;
      retryAfterSeconds: number;
    };

export async function checkRateLimit({
  rule,
  logger,
}: {
  rule: RateLimitRule;
  logger?: Logger;
}): Promise<RateLimitResult> {
  if (!isRedisRateLimitConfigured()) {
    return {
      limited: false,
      limit: rule.limit,
      remaining: rule.limit,
    };
  }

  try {
    const count = Number(await redis.incr(rule.key));
    if (count === 1) {
      await redis.expire(rule.key, rule.windowSeconds);
    }

    if (count > rule.limit) {
      return {
        limited: true,
        limit: rule.limit,
        retryAfterSeconds: rule.windowSeconds,
      };
    }

    return {
      limited: false,
      limit: rule.limit,
      remaining: Math.max(rule.limit - count, 0),
    };
  } catch (error) {
    logger?.warn("Redis rate limit unavailable", {
      error: error instanceof Error ? error.message : error,
    });

    return {
      limited: false,
      limit: rule.limit,
      remaining: rule.limit,
    };
  }
}

export function createRateLimitKey(parts: string[]) {
  return parts.map((part) => hashKeyPart(part)).join(":");
}

export function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    forwardedFor ||
    "unknown"
  );
}

export function hashRateLimitValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function hashKeyPart(part: string) {
  return part.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function isRedisRateLimitConfigured() {
  return (
    env.NODE_ENV === "test" ||
    Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN)
  );
}
