import "server-only";
import { redis } from "@/utils/redis";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const EXPIRATION = 60 * 60; // 1 hour
const REDIS_LOOKUP_TIMEOUT_MS = 1500;
const REDIS_SLOW_LOOKUP_MS = 500;
const DB_SLOW_LOOKUP_MS = 500;
const VALIDATION_SLOW_TOTAL_MS = 1500;

const logger = createScopedLogger("redis/account-validation");

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
  const validationStartTime = Date.now();

  // Check Redis cache first
  const redisLookupStartTime = Date.now();
  let cachedResult: string | null | undefined;

  try {
    cachedResult = await withTimeout(
      redis.get<string>(key),
      REDIS_LOOKUP_TIMEOUT_MS,
    );
  } catch (error) {
    logger.warn("Account validation redis lookup failed", {
      error,
      timedOut: isTimeoutError(error),
    });
  }

  const redisLookupDurationMs = Date.now() - redisLookupStartTime;
  if (redisLookupDurationMs > REDIS_SLOW_LOOKUP_MS) {
    logger.warn("Slow account validation redis lookup", {
      durationMs: redisLookupDurationMs,
      timedOut: cachedResult === undefined,
    });
  }

  if (cachedResult !== null && cachedResult !== undefined) {
    const totalDurationMs = Date.now() - validationStartTime;
    if (totalDurationMs > VALIDATION_SLOW_TOTAL_MS) {
      logger.warn("Slow account validation", {
        durationMs: totalDurationMs,
        source: "redis",
      });
    }
    return cachedResult;
  }

  // Not in cache, check database
  const dbLookupStartTime = Date.now();
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { email: true },
  });
  const dbLookupDurationMs = Date.now() - dbLookupStartTime;
  if (dbLookupDurationMs > DB_SLOW_LOOKUP_MS) {
    logger.warn("Slow account validation db lookup", {
      durationMs: dbLookupDurationMs,
    });
  }

  // Cache the result
  cacheValidationResult({ key, email: emailAccount?.email ?? null }).catch(
    () => undefined,
  );

  const totalDurationMs = Date.now() - validationStartTime;
  if (totalDurationMs > VALIDATION_SLOW_TOTAL_MS) {
    logger.warn("Slow account validation", {
      durationMs: totalDurationMs,
      source: "database",
    });
  }

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
  await redis.del(key);
}

async function cacheValidationResult({
  key,
  email,
}: {
  key: string;
  email: string | null;
}) {
  try {
    await redis.set(key, email, { ex: EXPIRATION });
  } catch (error) {
    logger.warn("Account validation redis write failed", { error });
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === "REDIS_TIMEOUT";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("REDIS_TIMEOUT"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
