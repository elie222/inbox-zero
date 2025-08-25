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
      // Normalized error metadata across common googleapis/gaxios shapes
      const err: any = error;
      const cause = err?.cause ?? err;
      const status =
        cause?.status ?? cause?.code ?? cause?.response?.status ?? undefined;
      const reason =
        cause?.errors?.[0]?.reason ??
        cause?.response?.data?.error?.errors?.[0]?.reason ??
        undefined;
      const errorMessage = String(cause?.message ?? err?.message ?? "");

      // Broad rate-limit detection: 429, 403 + known reasons, or well-known messages
      const isRateLimitError =
        status === 429 ||
        (status === 403 &&
          [
            "rateLimitExceeded",
            "userRateLimitExceeded",
            "quotaExceeded",
          ].includes(String(reason))) ||
        /(^|[\s-])rate limit exceeded/i.test(errorMessage) ||
        /quota exceeded/i.test(errorMessage);

      if (!isRateLimitError) {
        logger.error("Non-rate limit error encountered, not retrying", {
          errorMessage,
          status,
          reason,
        });
        throw error;
      }

      // Parse retry time from error message or headers
      const retryTime = parseRetryTime(errorMessage);
      const retryAfterHeader = cause?.response?.headers?.["retry-after"];
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
      } else if (retryAfterHeader) {
        // Handle Retry-After header (can be seconds or HTTP-date)
        const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
        if (!Number.isNaN(retryAfterSeconds)) {
          delayMs = retryAfterSeconds * 1000;
        } else {
          // Try parsing as HTTP-date
          const retryDate = new Date(retryAfterHeader);
          if (!Number.isNaN(retryDate.getTime())) {
            delayMs = Math.max(0, retryDate.getTime() - Date.now());
          }
        }

        if (delayMs > 0) {
          logger.warn("Gmail rate limit hit. Using Retry-After header", {
            retryAfterHeader,
            delaySeconds: Math.ceil(delayMs / 1000),
            attemptNumber: error.attemptNumber,
            maxRetries,
          });
        }
      }

      if (!delayMs || delayMs <= 0) {
        // Fallback to fixed delay if no retry time specified
        delayMs = 30_000;
        logger.warn("Gmail rate limit hit. Using fallback delay", {
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
      const retryDate = new Date(retryMatch[1]);
      // Validate the date is valid (not NaN)
      if (!Number.isNaN(retryDate.getTime())) {
        return retryDate;
      }
    } catch {
      // Invalid date format
    }
  }
  return null;
}
