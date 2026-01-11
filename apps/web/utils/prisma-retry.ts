import { Prisma } from "@/generated/prisma/client";

/**
 * Wraps a Prisma operation with retry logic for specific transient errors.
 * Primarily targets P2028 ("Transaction already closed") which occurs
 * frequently in E2E tests using Neon's connection pooler.
 */
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {},
): Promise<T> {
  const { maxRetries = 3, delayMs = 100 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2028" &&
        attempt < maxRetries
      ) {
        // Exponential backoff: 100ms, 200ms, 300ms...
        const backoff = delayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Prisma retry exhausted");
}
