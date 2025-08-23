import pRetry from "p-retry";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

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
    onFailedAttempt: async (error) => {
      const originalError = error.cause as any;
      const errorMessage = originalError?.message || error.message || "";

      // Check for various Gmail rate limit error patterns
      const isRateLimitError =
        originalError?.status === 429 ||
        originalError?.errors?.[0]?.reason === "rateLimitExceeded" ||
        errorMessage.includes("User-rate limit exceeded") ||
        errorMessage.includes("rate limit exceeded");

      if (!isRateLimitError) {
        logger.error("Non-rate limit error encountered, not retrying", {
          errorMessage,
          status: originalError?.status,
          reason: originalError?.errors?.[0]?.reason,
        });
        throw error;
      }

      // Parse retry time from error message
      const retryTime = parseRetryTime(errorMessage);
      let delayMs = 0;

      if (retryTime) {
        // Calculate delay until the specified retry time
        delayMs = Math.max(0, retryTime.getTime() - Date.now());
        logger.warn("Gmail rate limit hit. Will retry after specified time", {
          retryAfter: retryTime.toISOString(),
          delaySeconds: Math.ceil(delayMs / 1000),
          attemptNumber: error.attemptNumber,
          maxRetries,
        });
      } else {
        // Fallback to exponential backoff if no retry time specified
        delayMs = 30_000;
        logger.warn("Gmail rate limit hit. Retrying with exponential backoff", {
          delaySeconds: Math.ceil(delayMs / 1000),
          attemptNumber: error.attemptNumber,
          maxRetries,
        });
      }

      // Apply the custom delay
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    },
  });
}

/**
 * Parses the retry time from Gmail rate limit error messages
 * Example: "User-rate limit exceeded. Retry after 2025-08-22T18:22:38.763Z"
 */
function parseRetryTime(errorMessage: string): Date | null {
  const retryMatch = errorMessage.match(/Retry after (.+?)(\s|$)/);
  if (retryMatch?.[1]) {
    try {
      return new Date(retryMatch[1]);
    } catch {
      return null;
    }
  }
  return null;
}
