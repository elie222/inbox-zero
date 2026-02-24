import { captureException } from "@/utils/error";
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

type ReplyTrackerScopeLoggerArgs = Omit<
  LogReplyTrackerErrorArgs,
  "logger" | "emailAccountId" | "scope" | "capture"
>;

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

export function createReplyTrackerScopeLogger({
  logger,
  emailAccountId,
  scope,
  capture = false,
}: {
  logger: Logger;
  emailAccountId: string;
  scope: string;
  capture?: boolean;
}) {
  return ({
    message,
    operation,
    error,
    context,
  }: ReplyTrackerScopeLoggerArgs) =>
    logReplyTrackerError({
      logger,
      emailAccountId,
      scope,
      message,
      operation,
      error,
      context,
      capture,
    });
}
