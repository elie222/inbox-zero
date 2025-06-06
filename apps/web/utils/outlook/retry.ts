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
      // For Gmail API, rate limit errors have status 429 and reason 'rateLimitExceeded'
      const originalError = error.cause as any;

      // Looking at the error structure directly from logs
      const isRateLimitError = originalError?.status === 429;

      if (!isRateLimitError) {
        logger.error("Non-rate limit error encountered, not retrying", {
          errorMessage: originalError?.message || error.message,
          status: originalError?.status,
        });
        throw error;
      }

      logger.warn(
        `Gmail rate limit hit. Retrying... (${error.attemptNumber}/${maxRetries})`,
      );
    },
  });
}
