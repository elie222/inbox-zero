import { env } from "@/env";
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: env.UPSTASH_REDIS_URL,
  token: env.UPSTASH_REDIS_TOKEN,
});

export async function expire(key: string, seconds: number) {
  return redis.expire(key, seconds);
}
