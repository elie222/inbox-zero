import "server-only";
import { redis } from "@/utils/redis";
import prisma from "@/utils/prisma";

const EXPIRATION = 60 * 60; // 1 hour

/**
 * Get the Redis key for account validation
 */
function getValidationKey(userId: string, accountId: string): string {
  return `account:${userId}:${accountId}`;
}

/**
 * Validate that an account belongs to a user, using Redis for caching
 * @param userId The user ID
 * @param accountId The account ID to validate
 * @returns email address of the account if it belongs to the user, otherwise null
 */
export async function validateUserAccount(
  userId: string,
  accountId: string,
): Promise<string | null> {
  if (!userId || !accountId) return null;

  const key = getValidationKey(userId, accountId);

  // Check Redis cache first
  const cachedResult = await redis.get<string>(key);

  if (cachedResult !== null) {
    return cachedResult;
  }

  // Not in cache, check database
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { accountId, userId },
    select: { email: true },
  });

  const isValid = !!emailAccount;

  // Cache the result
  await redis.set(key, isValid ? "true" : "false", { ex: EXPIRATION });

  return isValid ? emailAccount?.email : null;
}

/**
 * Invalidate the cached validation result for a user's account
 * Useful when account ownership changes
 */
export async function invalidateAccountValidation(
  userId: string,
  accountId: string,
): Promise<void> {
  const key = getValidationKey(userId, accountId);
  await redis.del(key);
}
