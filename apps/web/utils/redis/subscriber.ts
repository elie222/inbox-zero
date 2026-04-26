import Redis from "ioredis";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ioredis");

// biome-ignore lint/complexity/noStaticOnlyClass: ignore
class RedisSubscriber {
  static createInstance(): Redis {
    if (!env.REDIS_URL) {
      throw new Error("REDIS_URL is not set");
    }

    logger.info("Initializing Redis subscriber connection");
    const redisSubscriber = new Redis(env.REDIS_URL);

    redisSubscriber.on("error", (error) => {
      logger.error("Redis connection error", { error });
    });

    redisSubscriber.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    return redisSubscriber;
  }
}

export { RedisSubscriber };
