import Redis from "ioredis";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ioredis");

// biome-ignore lint/complexity/noStaticOnlyClass: ignore
class RedisSubscriber {
  private static instance: Redis | null = null;

  static getInstance(): Redis {
    if (!RedisSubscriber.instance) {
      if (!env.REDIS_URL) {
        throw new Error("REDIS_URL is not set");
      }

      logger.info("Initializing Redis subscriber connection");
      RedisSubscriber.instance = new Redis(env.REDIS_URL);

      // Handle connection events
      RedisSubscriber.instance.on("error", (error) => {
        logger.error("Redis connection error", { error });
      });

      RedisSubscriber.instance.on("connect", () => {
        logger.info("Redis connected successfully");
      });
    }

    return RedisSubscriber.instance;
  }

  static disconnect(): void {
    if (RedisSubscriber.instance) {
      RedisSubscriber.instance.disconnect();
      RedisSubscriber.instance = null;
      logger.info("Redis disconnected");
    }
  }
}

export { RedisSubscriber };
