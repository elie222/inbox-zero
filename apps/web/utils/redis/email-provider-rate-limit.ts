import "server-only";
import { env } from "@/env";
import {
  type EmailProviderRateLimitProvider,
  toRateLimitProvider,
} from "@/utils/email/rate-limit-mode-error";
import { redis } from "@/utils/redis";

const RATE_LIMIT_KEY_PREFIX = "email-provider-rate-limit";

type StoredEmailProviderRateLimitState = {
  provider: EmailProviderRateLimitProvider;
  retryAt: string;
  source?: string;
  detectedAt: string;
};

export type RedisEmailProviderRateLimitState = {
  provider: EmailProviderRateLimitProvider;
  retryAt: Date;
  source?: string;
};

function getRateLimitKey(emailAccountId: string) {
  return `${RATE_LIMIT_KEY_PREFIX}:${emailAccountId}`;
}

export async function getEmailProviderRateLimitStateFromRedis({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return null;

  const key = getRateLimitKey(emailAccountId);
  const value = await redis.get<string>(key);
  if (!value) return null;

  const parsed = parseStoredEmailProviderRateLimitState(value);
  if (!parsed) {
    await redis.del(key);
    return null;
  }

  const retryAt = new Date(parsed.retryAt);
  if (retryAt.getTime() <= Date.now()) {
    await redis.del(key);
    return null;
  }

  return {
    provider: parsed.provider,
    retryAt,
    source: parsed.source,
  } satisfies RedisEmailProviderRateLimitState;
}

export async function setEmailProviderRateLimitStateInRedis({
  emailAccountId,
  provider,
  retryAt,
  source,
  ttlSeconds,
}: {
  emailAccountId: string;
  provider: EmailProviderRateLimitProvider;
  retryAt: Date;
  source?: string;
  ttlSeconds: number;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return;
  const value: StoredEmailProviderRateLimitState = {
    provider,
    retryAt: retryAt.toISOString(),
    source,
    detectedAt: new Date().toISOString(),
  };
  await redis.set(getRateLimitKey(emailAccountId), JSON.stringify(value), {
    ex: ttlSeconds,
  });
}

export async function deleteEmailProviderRateLimitStateFromRedis({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return;
  await redis.del(getRateLimitKey(emailAccountId));
}

export function isEmailProviderRateLimitRedisConfigured() {
  return (
    env.NODE_ENV === "test" ||
    Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN)
  );
}

function parseStoredEmailProviderRateLimitState(
  value: string,
): StoredEmailProviderRateLimitState | null {
  try {
    const parsed = JSON.parse(
      value,
    ) as Partial<StoredEmailProviderRateLimitState>;
    const provider = toRateLimitProvider(parsed.provider);
    if (!provider) return null;
    if (!parsed.retryAt || typeof parsed.retryAt !== "string") return null;
    if (Number.isNaN(new Date(parsed.retryAt).getTime())) return null;

    return {
      provider,
      retryAt: parsed.retryAt,
      source: parsed.source,
      detectedAt: parsed.detectedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
