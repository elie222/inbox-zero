import { env } from "@/env";
import { hash } from "@/utils/hash";
import { createScopedLogger } from "@/utils/logger";
import { acquireOwnedLock, clearOwnedLock } from "@/utils/redis/owned-lock";

const LOCK_KEY_PREFIX = "public-contact-context:v1:lock";
const RESEARCH_LOCK_TTL_SECONDS = 60;
const logger = createScopedLogger("redis/public-contact-context-lock");

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

function getLockKey(email: string) {
  return `${LOCK_KEY_PREFIX}:${hash(email)}`;
}

function isRedisConfigured() {
  return Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN);
}
