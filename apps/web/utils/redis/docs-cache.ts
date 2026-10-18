import { createHash } from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { redis } from "@/utils/redis";

const logger = createScopedLogger("redis/docs-cache");

const CACHE_KEY_PREFIX = "docs";
const CACHE_TTL_SECONDS = 12 * 60 * 60;

type DocsCacheKind = "index" | "page";

export async function getCachedDocs<T>(
  kind: DocsCacheKind,
  keyParts: string[],
): Promise<T | null> {
  if (!isRedisConfigured()) return null;

  try {
    return await redis.get<T>(getKey(kind, keyParts));
  } catch (error) {
    logger.error("Failed to get cached docs", { kind, error });
    return null;
  }
}

export async function setCachedDocs<T>(
  kind: DocsCacheKind,
  keyParts: string[],
  value: T,
  ttlSeconds = CACHE_TTL_SECONDS,
): Promise<void> {
  if (!isRedisConfigured()) return;

  try {
    await redis.set(getKey(kind, keyParts), value, { ex: ttlSeconds });
  } catch (error) {
    logger.error("Failed to cache docs", { kind, error });
  }
}

function getKey(kind: DocsCacheKind, keyParts: string[]) {
  const hash = createHash("sha256").update(keyParts.join("\n")).digest("hex");
  return `${CACHE_KEY_PREFIX}:${kind}:${hash}`;
}

function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_HTTP_URL && env.REDIS_HTTP_TOKEN);
}
