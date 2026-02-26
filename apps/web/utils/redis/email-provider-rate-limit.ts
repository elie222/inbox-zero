import "server-only";
import { env } from "@/env";
import { redis } from "@/utils/redis";

export async function getEmailProviderRateLimitStateValue({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return null;
  return redis.get<string>(getRateLimitKey(emailAccountId));
}

export async function setEmailProviderRateLimitStateValue({
  emailAccountId,
  value,
  ttlSeconds,
}: {
  emailAccountId: string;
  value: string;
  ttlSeconds: number;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return;
  await redis.set(getRateLimitKey(emailAccountId), value, { ex: ttlSeconds });
}

export async function deleteEmailProviderRateLimitState({
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

function getRateLimitKey(emailAccountId: string) {
  return `email-provider-rate-limit:${emailAccountId}`;
}
