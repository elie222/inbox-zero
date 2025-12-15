import { createHash } from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { redis } from "@/utils/redis";

const logger = createScopedLogger("redis/perplexity-research");

const CACHE_KEY_PREFIX = "perplexity-research";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}

function getPerplexityResearchKey(
  userId: string,
  email: string,
  name: string | undefined,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name?.trim().toLowerCase() ?? "";
  const input = `${normalizedEmail}:${normalizedName}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `${CACHE_KEY_PREFIX}:${userId}:${hash}`;
}

function getUserKeyPattern(userId: string) {
  return `${CACHE_KEY_PREFIX}:${userId}:*`;
}

export async function clearCachedPerplexityResearchForUser(
  userId: string,
): Promise<number> {
  if (!isRedisConfigured()) return 0;

  const pattern = getUserKeyPattern(userId);
  let deletedCount = 0;
  let cursor = 0;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = Number(nextCursor);

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== 0);

    if (deletedCount > 0) {
      logger.info("Cleared cached perplexity research for user", {
        userId,
        deletedCount,
      });
    }

    return deletedCount;
  } catch (error) {
    logger.error("Failed to clear cached perplexity research for user", {
      userId,
      error,
    });
    return deletedCount;
  }
}

export async function getCachedPerplexityResearch(
  userId: string,
  email: string,
  name: string | undefined,
): Promise<string | null> {
  if (!isRedisConfigured()) return null;

  try {
    return await redis.get<string>(
      getPerplexityResearchKey(userId, email, name),
    );
  } catch (error) {
    logger.error("Failed to get cached perplexity research", { email, error });
    return null;
  }
}

export async function setCachedPerplexityResearch(
  userId: string,
  email: string,
  name: string | undefined,
  content: string,
): Promise<void> {
  if (!isRedisConfigured()) return;

  if (!content?.trim()) {
    logger.warn("Skipping cache: content is empty", { email });
    return;
  }
  if (content.length > MAX_CONTENT_SIZE) {
    logger.warn("Skipping cache: content exceeds max size", {
      email,
      size: content.length,
      maxSize: MAX_CONTENT_SIZE,
    });
    return;
  }

  try {
    const key = getPerplexityResearchKey(userId, email, name);
    await redis.set(key, content, { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    logger.error("Failed to cache perplexity research", { email, error });
  }
}
