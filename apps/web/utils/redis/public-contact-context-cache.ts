import { z } from "zod";
import { env } from "@/env";
import {
  isSafeForSharedCache,
  type PublicContactContext,
  publicContactContextSchema,
} from "@/utils/ai/public-contact-context-schema";
import { hash } from "@/utils/hash";
import { createScopedLogger } from "@/utils/logger";
import { redis } from "@/utils/redis";
import { acquireOwnedLock, clearOwnedLock } from "@/utils/redis/owned-lock";

const CACHE_KEY_PREFIX = "public-contact-context:v1";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOT_FOUND_TTL_SECONDS = 12 * 60 * 60;
const RESEARCH_LOCK_TTL_SECONDS = 60;
const logger = createScopedLogger("redis/public-contact-context-cache");
const SET_CACHE_IF_LOCK_OWNED_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[2], ARGV[2], "EX", tonumber(ARGV[3]))
return 1
`;

const cacheEntrySchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("found"),
    context: publicContactContextSchema,
  }),
  z.strictObject({ status: z.literal("not_found") }),
]);

export type PublicContactContextCacheEntry = z.infer<typeof cacheEntrySchema>;

export async function getCachedPublicContactContext(
  email: string,
): Promise<PublicContactContextCacheEntry | null> {
  if (!isRedisConfigured()) return null;

  const key = getCacheKey(email);
  try {
    const cached = await redis.get<unknown>(key);
    if (!cached) return null;

    const parsed = cacheEntrySchema.safeParse(cached);
    if (!parsed.success) {
      logger.warn("Ignoring malformed public contact context cache entry", {
        issues: parsed.error.issues.length,
      });
      return null;
    }

    if (
      parsed.data.status === "found" &&
      !isSafeForSharedCache(parsed.data.context)
    ) {
      logger.warn("Ignoring unsafe public contact context cache entry");
      return null;
    }

    return parsed.data;
  } catch (error) {
    logger.error("Failed to read public contact context cache", { error });
    return null;
  }
}

export async function setCachedPublicContactContext(
  email: string,
  context: PublicContactContext,
  lockToken: string | undefined,
): Promise<boolean> {
  if (!isRedisConfigured()) return false;

  const parsed = publicContactContextSchema.safeParse(context);
  if (!parsed.success || !isSafeForSharedCache(parsed.data)) {
    logger.warn("Refusing unsafe public contact context cache entry");
    return false;
  }

  return setCacheEntry(
    email,
    { status: "found", context: parsed.data },
    CACHE_TTL_SECONDS,
    lockToken,
  );
}

export async function setCachedPublicContactContextNotFound(
  email: string,
  lockToken: string | undefined,
) {
  if (!isRedisConfigured()) return false;
  return setCacheEntry(
    email,
    { status: "not_found" },
    NOT_FOUND_TTL_SECONDS,
    lockToken,
  );
}

export async function acquirePublicContactResearchLock(email: string): Promise<{
  status: "acquired" | "busy" | "unavailable";
  lockToken?: string;
}> {
  if (!isRedisConfigured()) return { status: "acquired" };

  try {
    const lockToken = await acquireOwnedLock({
      key: getLockKey(email),
      processingTtlSeconds: RESEARCH_LOCK_TTL_SECONDS,
    });
    return lockToken ? { status: "acquired", lockToken } : { status: "busy" };
  } catch (error) {
    logger.error("Failed to acquire public contact research lock", { error });
    return { status: "unavailable" };
  }
}

export async function releasePublicContactResearchLock(
  email: string,
  lockToken: string | undefined,
) {
  if (!lockToken) return;

  try {
    await clearOwnedLock({ key: getLockKey(email), lockToken });
  } catch (error) {
    logger.error("Failed to release public contact research lock", { error });
  }
}

async function setCacheEntry(
  email: string,
  entry: PublicContactContextCacheEntry,
  ttlSeconds: number,
  lockToken: string | undefined,
) {
  if (!lockToken) return false;

  try {
    const result = await redis.eval<string[], number>(
      SET_CACHE_IF_LOCK_OWNED_SCRIPT,
      [getLockKey(email), getCacheKey(email)],
      [lockToken, JSON.stringify(entry), ttlSeconds.toString()],
    );
    return result === 1;
  } catch (error) {
    logger.error("Failed to write public contact context cache", { error });
    return false;
  }
}

function getCacheKey(email: string) {
  return `${CACHE_KEY_PREFIX}:${hash(email)}`;
}

function getLockKey(email: string) {
  return `${CACHE_KEY_PREFIX}:lock:${hash(email)}`;
}

function isRedisConfigured() {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}
