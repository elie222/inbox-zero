import "server-only";
import { env } from "@/env";
import { redis } from "@/utils/redis";
import prisma from "@/utils/prisma";

const EXPIRATION = 60 * 60; // 1 hour
const shouldUseRedisCache = !!(
  env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN
);

/**
 * Get the Redis key for account validation
 */
function getValidationKey({
  userId,
  emailAccountId,
}: {
  userId: string;
  emailAccountId: string;
}): string {
  return `account:${userId}:${emailAccountId}`;
}

/**
 * Validate that an account belongs to a user, using Redis for caching
 * @param userId The user ID
 * @param accountId The account ID to validate
 * @returns email address of the account if it belongs to the user, otherwise null
 */
export async function getEmailAccount({
  userId,
  emailAccountId,
}: {
  userId: string;
  emailAccountId: string;
}): Promise<string | null> {
  if (!userId || !emailAccountId) return null;

  const key = getValidationKey({ userId, emailAccountId });

  // Check Redis cache first
  const cachedResult = await runRedisSafely(() => redis.get<string>(key));
  if (cachedResult !== null) {
    return cachedResult;
  }

  // Not in cache, check database
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { email: true },
  });

  // Cache the result
  await runRedisSafely(() =>
    redis.set(key, emailAccount?.email ?? null, { ex: EXPIRATION }),
  );

  return emailAccount?.email ?? null;
}

/**
 * Invalidate the cached validation result for a user's account
 * Useful when account ownership changes
 */
export async function invalidateAccountValidation({
  userId,
  emailAccountId,
}: {
  userId: string;
  emailAccountId: string;
}): Promise<void> {
  const key = getValidationKey({ userId, emailAccountId });
  await runRedisSafely(() => redis.del(key));
}

async function runRedisSafely<T>(
  operation: () => Promise<T>,
): Promise<T | null> {
  if (!shouldUseRedisCache) return null;

  try {
    return await operation();
  } catch {
    // Ignore Redis failures in local/dev environments.
    return null;
  }
}
