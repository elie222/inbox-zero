import { captureException } from "@/utils/error";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import type { Logger } from "@/utils/logger";

export async function logReplyTrackerError({
  logger,
  emailAccountId,
  scope,
  message,
  operation,
  error,
  context,
  capture,
}: {
  logger: Logger;
  emailAccountId: string;
  scope: string;
  message: string;
  operation: string;
  error: unknown;
  context?: Record<string, unknown>;
  capture?: boolean;
}) {
  await logErrorWithDedupe({
    logger,
    message,
    error,
    context,
    dedupeKeyParts: {
      scope: `reply-tracker/${scope}`,
      emailAccountId,
      operation,
    },
  });

  if (capture) {
    captureException(error, { emailAccountId });
  }
}
