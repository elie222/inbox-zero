import { env } from "@/env";
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: env.UPSTASH_REDIS_URL,
  token: env.UPSTASH_REDIS_TOKEN,
});

export function isRedisConfigured() {
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) return false;

  try {
    const url = new URL(env.UPSTASH_REDIS_URL);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

export async function expire(key: string, seconds: number) {
  return redis.expire(key, seconds);
}
