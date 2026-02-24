import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import { handleOutboundReply } from "./outbound";
import { cleanupThreadAIDrafts, trackSentDraftStatus } from "./draft-tracking";
import { clearFollowUpLabel } from "@/utils/follow-up/labels";

export async function handleOutboundMessage({
  emailAccount,
  message,
  provider,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  provider: EmailProvider;
  logger: Logger;
}) {
  logger = logger.with({
    email: emailAccount.email,
    messageId: message.id,
    threadId: message.threadId,
  });

  logger.info("Handling outbound message", {
    messageLabelIds: message.labelIds,
    messageInternalDate: message.internalDate,
  });
  logger.trace("Outbound message details", {
    messageFrom: message.headers.from,
    messageTo: message.headers.to,
    messageSubject: message.headers.subject,
  });

  await Promise.allSettled([
    trackSentDraftStatus({
      emailAccountId: emailAccount.id,
      message,
      provider,
      logger,
    }).catch((error) =>
      reportReplyTrackerError({
        logger,
        emailAccountId: emailAccount.id,
        message: "Error tracking sent draft status",
        operation: "track-sent-draft-status",
        error,
      }),
    ),
    handleOutboundReply({
      emailAccount,
      message,
      provider,
      logger,
    }).catch((error) =>
      reportReplyTrackerError({
        logger,
        emailAccountId: emailAccount.id,
        message: "Error handling outbound reply",
        operation: "handle-outbound-reply",
        error,
      }),
    ),
  ]);

  try {
    await cleanupThreadAIDrafts({
      threadId: message.threadId,
      emailAccountId: emailAccount.id,
      provider,
      logger,
      excludeMessageId: message.id,
    });
  } catch (error) {
    logger.error("Error during thread draft cleanup", { error });
    captureException(error, { emailAccountId: emailAccount.id });
  }

  // Remove follow-up label if present (user replied, so follow-up no longer needed)
  try {
    await clearFollowUpLabel({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      provider,
      logger,
    });
  } catch (error) {
    logger.error("Error removing follow-up label", { error });
    captureException(error, { emailAccountId: emailAccount.id });
  }
}

async function reportReplyTrackerError({
  logger,
  emailAccountId,
  message,
  operation,
  error,
}: {
  logger: Logger;
  emailAccountId: string;
  message: string;
  operation: string;
  error: unknown;
}) {
  await logErrorWithDedupe({
    logger,
    message,
    error,
    dedupeKeyParts: {
      scope: "reply-tracker/handle-outbound",
      emailAccountId,
      operation,
    },
  });
  captureException(error, { emailAccountId });
}
