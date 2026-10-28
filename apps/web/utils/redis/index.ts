import { env } from "@/env";
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: env.REDIS_HTTP_URL,
  token: env.REDIS_HTTP_TOKEN,
});

export async function expire(key: string, seconds: number) {
  return redis.expire(key, seconds);
}
