import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "./logger";

/**
 * Wraps a Prisma operation with retry logic for specific transient errors.
 * Primarily targets P2028 ("Transaction already closed") which occurs
 * frequently in E2E tests using Neon's connection pooler.
 *
 * @param operation - The Prisma operation to execute.
 * @param options - Retry configuration.
 * @param options.maxRetries - Maximum number of retry attempts (default: 3).
 * @param options.delayMs - Initial delay in milliseconds for backoff (default: 100).
 * @param options.logger - Optional logger for retry visibility.
 * @returns The result of the Prisma operation.
 * @throws The original error if retries are exhausted or if a non-retriable error occurs.
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
