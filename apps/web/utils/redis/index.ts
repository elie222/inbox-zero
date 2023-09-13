import { env } from "@/env.mjs";
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: env.UPSTASH_REDIS_URL,
  token: env.UPSTASH_REDIS_TOKEN,
});
