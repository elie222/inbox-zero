import { checkCommonErrors } from "@/utils/error";
import { trackError } from "@/utils/posthog";
import type { Logger } from "@/utils/logger";

/**
 * Handles errors from async webhook processing in the same way as withError middleware
 * This ensures consistent error logging between sync and async webhook handlers
 */
export async function handleWebhookError(
  error: unknown,
  options: {
    email: string;
    url: string;
    logger: Logger;
  },
) {
  const { email, url, logger } = options;

  const apiError = checkCommonErrors(error, url);
  if (apiError) {
    await trackError({
      email,
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
    error: error instanceof Error ? error.message : error,
    url,
  });
}
