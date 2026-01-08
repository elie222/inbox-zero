import { createHash } from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { redis } from "@/utils/redis";

const logger = createScopedLogger("redis/research-cache");

const CACHE_KEY_PREFIX = "research";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

export type ResearchSource = "perplexity" | "websearch";

function isRedisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}

function getResearchCacheKey(
  userId: string,
  source: ResearchSource,
  email: string,
  name: string | undefined,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name?.trim().toLowerCase() ?? "";
  const input = `${normalizedEmail}:${normalizedName}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `${CACHE_KEY_PREFIX}:${source}:${userId}:${hash}`;
}

function getUserKeyPattern(userId: string, source?: ResearchSource) {
  if (source) {
    return `${CACHE_KEY_PREFIX}:${source}:${userId}:*`;
  }
  // Match all sources for this user
  return `${CACHE_KEY_PREFIX}:*:${userId}:*`;
}

export async function clearCachedResearchForUser(
  userId: string,
  source?: ResearchSource,
): Promise<number> {
  if (!isRedisConfigured()) return 0;

  const pattern = getUserKeyPattern(userId, source);
  let deletedCount = 0;

  try {
    let cursor = 0;
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
      logger.info("Cleared cached research for user", {
        userId,
        source: source ?? "all",
        deletedCount,
      });
    }

    return deletedCount;
  } catch (error) {
    logger.error("Failed to clear cached research for user", {
      userId,
      source: source ?? "all",
      error,
    });
    return deletedCount;
  }
}

export async function getCachedResearch(
  userId: string,
  source: ResearchSource,
  email: string,
  name: string | undefined,
): Promise<string | null> {
  if (!isRedisConfigured()) return null;

  try {
    return await redis.get<string>(
      getResearchCacheKey(userId, source, email, name),
    );
  } catch (error) {
    logger.error("Failed to get cached research", { source, email, error });
    return null;
  }
}

export async function setCachedResearch(
  userId: string,
  source: ResearchSource,
  email: string,
  name: string | undefined,
  content: string,
): Promise<void> {
  if (!isRedisConfigured()) return;

  if (!content?.trim()) {
    logger.warn("Skipping cache: content is empty", { source, email });
    return;
  }
  if (content.length > MAX_CONTENT_SIZE) {
    logger.warn("Skipping cache: content exceeds max size", {
      source,
      email,
      size: content.length,
      maxSize: MAX_CONTENT_SIZE,
    });
    return;
  }

  try {
    const key = getResearchCacheKey(userId, source, email, name);
    await redis.set(key, content, { ex: CACHE_TTL_SECONDS });
  } catch (error) {
    logger.error("Failed to cache research", { source, email, error });
  }
}
