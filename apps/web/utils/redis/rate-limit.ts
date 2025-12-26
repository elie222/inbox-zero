import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/utils/redis";

// Create rate limiter with sliding window algorithm.
// 6 requests per 1 second - used as fallback when QStash is unavailable
// to prevent overwhelming Gmail API limits.
const gmailRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(6, "1 s"),
  prefix: "ratelimit:gmail",
});

/**
 * Acquires a rate limit token, blocking until available.
 * Uses atomic Redis operations via Upstash Ratelimit to prevent race conditions.
 *
 * @param identifier - Unique identifier for rate limiting scope (e.g., emailAccountId)
 * @param timeout - Maximum time to wait in milliseconds (default: 30000ms / 30 seconds)
 * @returns Promise that resolves when token is acquired
 * @throws {Error} If rate limit token cannot be acquired within the timeout period
 */
export async function acquireRateLimitToken(
  identifier: string,
  timeout = 30_000,
): Promise<void> {
  const { success } = await gmailRateLimiter.blockUntilReady(
    identifier,
    timeout,
  );

  if (!success) {
    throw new Error(`Rate limit timeout after ${timeout}ms for ${identifier}`);
  }
}
