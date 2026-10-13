import { checkCommonErrors, isInvalidGrantError } from "@/utils/error";
import { trackError } from "@/utils/posthog";
import type { Logger } from "@/utils/logger";
import { recordRateLimitFromApiError } from "@/utils/email/rate-limit";
import { isProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";

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

  if (isInvalidGrantError(error)) {
    logger.warn("Invalid grant while processing webhook", { emailAccountId });

    // Provider clients handle credential cleanup using the tokens that failed.
    // This outer handler has no credential snapshot and must not clear newer tokens.
    return;
  }

  const apiError = checkCommonErrors(error, url, logger);
  if (apiError) {
    await recordRateLimitFromApiError({
      apiErrorType: apiError.type,
      error,
      emailAccountId,
      logger,
      source: url,
    });

    // The rate-limit guard throws on every skipped call while the mode is
    // active, so tracking it records our own skips rather than provider errors.
    if (!isProviderRateLimitModeError(error)) {
      await trackError({
        email,
        emailAccountId,
        errorType: apiError.type,
        type: "api",
        url,
      });
    }

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
