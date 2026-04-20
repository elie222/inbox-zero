import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { handleOutboundReply } from "./outbound";
import { cleanupThreadAIDrafts, trackSentDraftStatus } from "./draft-tracking";
import { clearFollowUpLabel } from "@/utils/follow-up/labels";
import { logReplyTrackerError } from "./error-logging";
import {
  acquireOutboundMessageLock,
  clearOutboundMessageLock,
  markOutboundMessageProcessed,
} from "@/utils/redis/message-processing";

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
  const lockToken = await acquireOutboundMessageLock({
    emailAccountId: emailAccount.id,
    messageId: message.id,
  });
  if (!lockToken) {
    logger.info(
      "Outbound message already processed or currently processing, skipping.",
    );
    return;
  }

  let processedSuccessfully = false;

  try {
    const results = await Promise.allSettled([
      trackSentDraftStatus({
        emailAccountId: emailAccount.id,
        message,
        provider,
        logger,
      }),
      handleOutboundReply({
        emailAccount,
        message,
        provider,
        logger,
      }),
    ]);

    const [trackSentDraftStatusResult, handleOutboundReplyResult] = results;

    if (trackSentDraftStatusResult.status === "rejected") {
      await logReplyTrackerError({
        logger,
        emailAccountId: emailAccount.id,
        scope: "handle-outbound",
        message: "Error tracking sent draft status",
        operation: "track-sent-draft-status",
        error: trackSentDraftStatusResult.reason,
        capture: true,
      });
    }

    if (handleOutboundReplyResult.status === "rejected") {
      await logReplyTrackerError({
        logger,
        emailAccountId: emailAccount.id,
        scope: "handle-outbound",
        message: "Error handling outbound reply",
        operation: "handle-outbound-reply",
        error: handleOutboundReplyResult.reason,
        capture: true,
      });
    }

    // Persist the processed marker once the expensive reply-tracking work
    // completes so follow-up cleanup failures do not trigger duplicate replays.
    processedSuccessfully = results.every(
      (result) => result.status === "fulfilled",
    );

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
  } finally {
    if (processedSuccessfully) {
      const markedAsProcessed = await markOutboundMessageProcessed({
        emailAccountId: emailAccount.id,
        messageId: message.id,
        lockToken,
      }).catch((error) => {
        logger.error("Failed to mark outbound message as processed", { error });
        return false;
      });
      if (!markedAsProcessed) {
        logger.warn(
          "Skipped marking outbound message as processed because lock was no longer owned.",
        );
      }
    } else {
      const lockCleared = await clearOutboundMessageLock({
        emailAccountId: emailAccount.id,
        messageId: message.id,
        lockToken,
      }).catch((error) => {
        logger.error("Failed to clear outbound message lock", { error });
        return false;
      });
      if (!lockCleared) {
        logger.warn(
          "Skipped clearing outbound message lock because lock was no longer owned.",
        );
      }
    }
  }
}
