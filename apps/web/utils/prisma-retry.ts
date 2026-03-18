import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "./logger";

/**
 * Wraps a Prisma operation with retry logic for specific transient errors.
 * Primarily targets P2028 ("Transaction already closed") which occurs
 * frequently in E2E tests using Neon's connection pooler.
 *
 * NOTE: Do not add new usages of this wrapper. Prisma operations should not
 * need retries under normal conditions. Existing call sites are grandfathered.
 */
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; logger?: Logger } = {},
): Promise<T> {
  const { maxRetries = 3, delayMs = 100, logger } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2028" &&
        attempt < maxRetries
      ) {
        // Linear backoff: 100ms, 200ms, 300ms...
        const backoff = delayMs * attempt;
        logger?.warn("Retrying Prisma operation due to P2028", {
          attempt,
          nextAttemptInMs: backoff,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
  // Unreachable: loop always exits via return (success) or throw (error)
  throw new Error("Prisma retry exhausted (unreachable)");
}
