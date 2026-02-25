import { checkCommonErrors } from "@/utils/error";
import { trackError } from "@/utils/posthog";
import type { Logger } from "@/utils/logger";
import { recordProviderRateLimitFromError } from "@/utils/gmail/rate-limit";

/**
 * Handles errors from async webhook processing in the same way as withError middleware
 * This ensures consistent error logging between sync and async webhook handlers
 */
export async function handleWebhookError(
  error: unknown,
  options: {
    email: string;
    emailAccountId: string;
    url: string;
    logger: Logger;
  },
) {
  const { email, emailAccountId, url, logger } = options;

  const apiError = checkCommonErrors(error, url, logger);
  if (apiError) {
    if (
      apiError.type === "Gmail Rate Limit Exceeded" ||
      apiError.type === "Outlook Rate Limit"
    ) {
      const provider =
        apiError.type === "Outlook Rate Limit" ? "microsoft" : "google";
      try {
        await recordProviderRateLimitFromError({
          error,
          emailAccountId,
          provider,
          logger,
          source: url,
        });
      } catch (recordError) {
        logger.warn("Failed to record provider rate-limit state", {
          provider,
          error:
            recordError instanceof Error ? recordError.message : recordError,
        });
      }
    }

    await trackError({
      email,
      emailAccountId,
      errorType: apiError.type,
      type: "api",
      url,
    });

    logger.warn("Error processing webhook", {
      error: apiError.message,
      errorType: apiError.type,
    });
    return;
  }

  logger.error("Unhandled error", {
    error,
    url,
  });
}
