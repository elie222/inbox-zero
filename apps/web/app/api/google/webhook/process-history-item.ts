import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { emailToContent } from "@/utils/mail";
import { GmailLabel } from "@/utils/gmail/label";
import { runColdEmailBlockerWithProvider } from "@/utils/cold-email/is-cold-email";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { blockUnsubscribedEmails } from "@/app/api/google/webhook/block-unsubscribed-emails";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type { ProcessHistoryOptions } from "@/app/api/google/webhook/types";
import { ColdEmailSetting } from "@prisma/client";
import { logger } from "@/app/api/google/webhook/logger";
import { internalDateToDate } from "@/utils/date";
import { extractEmailAddress } from "@/utils/email";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import {
  trackSentDraftStatus,
  cleanupThreadAIDrafts,
} from "@/utils/reply-tracker/draft-tracking";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { formatError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { enqueueDigestItem } from "@/utils/digest/index";
import { HistoryEventType } from "@/app/api/google/webhook/types";
import { handleLabelRemovedEvent } from "@/app/api/google/webhook/process-label-removed-event";

export async function processHistoryItem(
  historyItem: {
    type: HistoryEventType;
    item:
      | gmail_v1.Schema$HistoryMessageAdded
      | gmail_v1.Schema$HistoryLabelAdded
      | gmail_v1.Schema$HistoryLabelRemoved;
  },
  {
    gmail,
    emailAccount,
    accessToken,
    hasAutomationRules,
    hasAiAccess,
    rules,
  }: ProcessHistoryOptions,
) {
  const { type, item } = historyItem;
  const messageId = item.message?.id;
  const threadId = item.message?.threadId;

  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  if (!messageId || !threadId) return;

  const loggerOptions = {
    email: userEmail,
    messageId,
    threadId,
  };

  const provider = await createEmailProvider({
    emailAccountId,
    provider: "google",
  });

  if (type === HistoryEventType.LABEL_REMOVED) {
    logger.info("Processing label removed event for learning", loggerOptions);
    return handleLabelRemovedEvent(item, {
      gmail,
      emailAccount,
      provider,
    });
  } else if (type === HistoryEventType.LABEL_ADDED) {
    logger.info("Processing label added event for learning", loggerOptions);
    return;
  }

  const isFree = await markMessageAsProcessing({ userEmail, messageId });

  if (!isFree) {
    logger.info("Skipping. Message already being processed.", loggerOptions);
    return;
  }

  logger.info("Getting message", loggerOptions);

  try {
    const [parsedMessage, hasExistingRule] = await Promise.all([
      provider.getMessage(messageId),
      prisma.executedRule.findUnique({
        where: {
          unique_emailAccount_thread_message: {
            emailAccountId,
            threadId,
            messageId,
          },
        },
        select: { id: true },
      }),
    ]);

    // if the rule has already been executed, skip
    if (hasExistingRule) {
      logger.info("Skipping. Rule already exists.", loggerOptions);
      return;
    }

    if (isIgnoredSender(parsedMessage.headers.from)) {
      logger.info("Skipping. Ignored sender.", loggerOptions);
      return;
    }

    const isForAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.to,
    });

    if (isForAssistant) {
      logger.info("Passing through assistant email.", loggerOptions);
      return processAssistantEmail({
        message: parsedMessage,
        emailAccountId,
        userEmail,
        provider,
      });
    }

    const isFromAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.from,
    });

    if (isFromAssistant) {
      logger.info("Skipping. Assistant email.", loggerOptions);
      return;
    }

    const isOutbound = parsedMessage.labelIds?.includes(GmailLabel.SENT);

    if (isOutbound) {
      await handleOutbound(emailAccount, parsedMessage, gmail);
      return;
    }

    // check if unsubscribed
    const blocked = await blockUnsubscribedEmails({
      from: parsedMessage.headers.from,
      emailAccountId,
      gmail,
      messageId,
    });

    if (blocked) {
      logger.info("Skipping. Blocked unsubscribed email.", loggerOptions);
      return;
    }

    const shouldRunBlocker = shouldRunColdEmailBlocker(
      emailAccount.coldEmailBlocker,
      hasAiAccess,
    );

    if (shouldRunBlocker) {
      logger.info("Running cold email blocker...", loggerOptions);

      const content = emailToContent(parsedMessage);

      const response = await runColdEmailBlockerWithProvider({
        email: {
          from: parsedMessage.headers.from,
          to: "",
          subject: parsedMessage.headers.subject,
          content,
          id: messageId,
          threadId,
          date: internalDateToDate(parsedMessage.internalDate),
        },
        provider,
        emailAccount,
        modelType: "default",
      });

      if (response.isColdEmail) {
        if (emailAccount.coldEmailDigest && response.coldEmailId) {
          logger.info("Enqueuing a cold email digest item", {
            coldEmailId: response.coldEmailId,
          });
          await enqueueDigestItem({
            email: parsedMessage,
            emailAccountId,
            coldEmailId: response.coldEmailId,
          });
        }
        logger.info("Skipping. Cold email detected.", loggerOptions);
        return;
      }
    }

    // categorize a sender if we haven't already
    // this is used for category filters in ai rules
    if (emailAccount.autoCategorizeSenders) {
      const sender = extractEmailAddress(parsedMessage.headers.from);
      const existingSender = await prisma.newsletter.findUnique({
        where: {
          email_emailAccountId: { email: sender, emailAccountId },
        },
        select: { category: true },
      });
      if (!existingSender?.category) {
        await categorizeSender(sender, emailAccount, gmail, accessToken);
      }
    }

    if (hasAutomationRules && hasAiAccess) {
      logger.info("Running rules...", loggerOptions);

      await runRules({
        client: provider,
        message: parsedMessage,
        rules,
        emailAccount,
        isTest: false,
        modelType: "default",
      });
    }
  } catch (error: unknown) {
    // gmail bug or snoozed email: https://stackoverflow.com/questions/65290987/gmail-api-getmessage-method-returns-404-for-message-gotten-from-listhistory-meth
    if (
      error instanceof Error &&
      error.message === "Requested entity was not found."
    ) {
      logger.info("Message not found", loggerOptions);
      return;
    }

    throw error;
  }
}

async function handleOutbound(
  emailAccount: EmailAccountWithAI,
  message: ParsedMessage,
  gmail: gmail_v1.Gmail,
) {
  const loggerOptions = {
    email: emailAccount.email,
    messageId: message.id,
    threadId: message.threadId,
  };

  logger.info("Handling outbound reply", loggerOptions);

  // Run tracking and outbound reply handling concurrently
  // The individual functions handle their own operational errors.
  const [trackingResult, outboundResult] = await Promise.allSettled([
    trackSentDraftStatus({
      emailAccountId: emailAccount.id,
      message,
      gmail,
    }),
    handleOutboundReply({ emailAccount, message, gmail }),
  ]);

  if (trackingResult.status === "rejected") {
    logger.error("Error tracking sent draft status", {
      ...loggerOptions,
      error: formatError(trackingResult.reason),
    });
  }

  if (outboundResult.status === "rejected") {
    logger.error("Error handling outbound reply", {
      ...loggerOptions,
      error: formatError(outboundResult.reason),
    });
  }

  // Run cleanup for any other old/unmodified drafts in the thread
  // Must happen after previous steps
  try {
    await cleanupThreadAIDrafts({
      threadId: message.threadId,
      emailAccountId: emailAccount.id,
      gmail,
    });
  } catch (cleanupError) {
    logger.error("Error during thread draft cleanup", {
      ...loggerOptions,
      error: cleanupError,
    });
  }

  // Still skip further processing for outbound emails
  return;
}

export function shouldRunColdEmailBlocker(
  coldEmailBlocker: ColdEmailSetting | null,
  hasAiAccess: boolean,
) {
  return (
    (coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL ||
      coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
      coldEmailBlocker === ColdEmailSetting.LABEL) &&
    hasAiAccess
  );
}
