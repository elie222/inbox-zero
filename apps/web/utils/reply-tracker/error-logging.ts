import { captureException, isKnownApiError, SafeError } from "@/utils/error";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import type { Logger } from "@/utils/logger";

type LogReplyTrackerErrorArgs = {
  logger: Logger;
  emailAccountId: string;
  scope: string;
  message: string;
  operation: string;
  error: unknown;
  context?: Record<string, unknown>;
  capture?: boolean;
};

export async function logReplyTrackerError({
  logger,
  emailAccountId,
  scope,
  message,
  operation,
  error,
  context,
  capture,
}: LogReplyTrackerErrorArgs) {
  // SafeErrors are expected account states (usage limits, blocked content,
  // unavailable model settings), and known provider errors (throttling,
  // revoked access, deleted items) are provider states, not bugs to report.
  const isExpected = error instanceof SafeError || isKnownApiError(error);

  await logErrorWithDedupe({
    logger,
    message,
    error,
    context,
    level: isExpected ? "warn" : "error",
    dedupeKeyParts: {
      scope: `reply-tracker/${scope}`,
      emailAccountId,
      operation,
    },
  });

  if (capture && !isExpected) {
    captureException(error, { emailAccountId });
  }
}
