import { env } from "@/env";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) {
    throw new Error("Upstash Redis is not configured");
  }
  _redis = new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN,
  });
  return _redis;
}

// Lazy proxy so import-time does not create a client
export const redis = new Proxy({} as unknown as Redis, {
  get(_target, prop, receiver) {
    const client = getRedis() as unknown as Record<string, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as unknown as Redis;

export async function expire(key: string, seconds: number) {
  return getRedis().expire(key, seconds);
}
