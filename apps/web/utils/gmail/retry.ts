import pRetry from "p-retry";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("gmail-retry");

/**
 * Retries a Gmail API operation when rate limits are hit
 */
export async function withGmailRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  return pRetry(operation, {
    retries: maxRetries,
    onFailedAttempt: (error) => {
      // Only retry on rate limit errors (429)
      const originalError = error.cause as any;
      if (originalError?.response?.status !== 429) {
        throw error;
      }

      logger.warn(
        `Gmail rate limit hit. Retrying... (${error.attemptNumber}/${maxRetries})`,
      );
    },
  });
}
