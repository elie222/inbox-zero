import { env } from "@/env.mjs";

// Function to dynamically import Redis based on user preference or environment variable
async function getRedisClient(): Promise<{
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  // hgetall: (key: string) => Promise<any>;
  // hset: (key: string, value: any) => Promise<any>;
}> {
  if (env.UPSTASH_REDIS_TOKEN) {
    const { Redis } = await import("@upstash/redis");
    return new Redis({
      url: env.REDIS_URL,
      token: env.UPSTASH_REDIS_TOKEN,
    });
  } else {
    const { createClient } = await import("redis");
    const RedisClient = createClient({ url: env.REDIS_URL });
    await RedisClient.connect();
    return RedisClient;
  }
}

export const redis = await getRedisClient();
