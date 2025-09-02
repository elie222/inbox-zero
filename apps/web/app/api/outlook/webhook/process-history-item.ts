import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import prisma from "@/utils/prisma";
import { runColdEmailBlocker } from "@/utils/cold-email/is-cold-email";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { blockUnsubscribedEmails } from "@/app/api/outlook/webhook/block-unsubscribed-emails";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type {
  ProcessHistoryOptions,
  OutlookResourceData,
} from "@/app/api/outlook/webhook/types";
import { ColdEmailSetting } from "@prisma/client";
import { logger } from "@/app/api/outlook/webhook/logger";
import { extractEmailAddress } from "@/utils/email";
import {
  trackSentDraftStatus,
  cleanupThreadAIDrafts,
} from "@/utils/reply-tracker/draft-tracking";
import { formatError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";

export async function processHistoryItem(
  resourceData: OutlookResourceData,
  {
    provider,
    emailAccount,
    hasAutomationRules,
    hasAiAccess,
    rules,
  }: ProcessHistoryOptions,
) {
  const messageId = resourceData.id;
  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  const loggerOptions = {
    email: userEmail,
    messageId,
  };

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
            threadId: resourceData.conversationId || messageId,
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

    const from = parsedMessage.headers.from;
    const to = parsedMessage.headers.to
      ? parsedMessage.headers.to
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean)
      : [];
    const subject = parsedMessage.headers.subject || "";

    if (!from) {
      logger.error("Message has no sender", loggerOptions);
      return;
    }

    // Skip messages that are not in inbox or sent items folders
    // We want to process inbox messages (for rules/automation) and sent messages (for reply tracking)
    // Note: ParsedMessage already contains the necessary folder information in labels
    const isInInbox = parsedMessage.labelIds?.includes("INBOX") || false;
    const isInSentItems = parsedMessage.labelIds?.includes("SENT") || false;

    if (!isInInbox && !isInSentItems) {
      logger.info("Skipping message not in inbox or sent items", {
        ...loggerOptions,
        labels: parsedMessage.labelIds,
      });
      return;
    }

    if (
      isAssistantEmail({
        userEmail,
        emailToCheck: to.join(","),
      })
    ) {
      logger.info("Passing through assistant email.", loggerOptions);
      return processAssistantEmail({
        message: {
          id: messageId,
          threadId: resourceData.conversationId || messageId,
          headers: {
            from,
            to: to.join(","),
            subject,
            date: parsedMessage.date || new Date().toISOString(),
          },
          snippet: parsedMessage.snippet || "",
          historyId: resourceData.id,
          inline: [],
          subject,
          date: parsedMessage.date
            ? new Date(parsedMessage.date).toISOString()
            : new Date().toISOString(),
          conversationIndex: parsedMessage.conversationIndex,
        },
        emailAccountId,
        userEmail,
        provider,
      });
    }

    const isFromAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: from,
    });

    if (isFromAssistant) {
      logger.info("Skipping. Assistant email.", loggerOptions);
      return;
    }

    const isOutbound = isInSentItems;

    if (isOutbound) {
      await handleOutbound(
        emailAccount,
        parsedMessage,
        provider,
        messageId,
        resourceData.conversationId || undefined,
      );
      return;
    }

    // check if unsubscribed
    const blocked = await blockUnsubscribedEmails({
      from,
      emailAccountId,
      messageId,
      provider,
      ownerEmail: userEmail,
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

      const emailForLLM = getEmailForLLM(parsedMessage);

      const response = await runColdEmailBlocker({
        email: {
          ...emailForLLM,
          threadId: resourceData.conversationId || messageId,
          date: parsedMessage.date ? new Date(parsedMessage.date) : new Date(),
        },
        provider,
        emailAccount,
        modelType: "default",
      });

      if (response.isColdEmail) {
        logger.info("Skipping. Cold email detected.", loggerOptions);
        return;
      }
    }

    // categorize a sender if we haven't already
    // this is used for category filters in ai rules
    if (emailAccount.autoCategorizeSenders) {
      const sender = extractEmailAddress(from);
      const existingSender = await prisma.newsletter.findUnique({
        where: {
          email_emailAccountId: { email: sender, emailAccountId },
        },
        select: { category: true },
      });
      if (!existingSender?.category) {
        await categorizeSender(sender, emailAccount, provider);
      }
    }

    if (hasAutomationRules && hasAiAccess) {
      logger.info("Running rules...", loggerOptions);

      await runRules({
        provider,
        message: {
          id: messageId,
          threadId: resourceData.conversationId || messageId,
          headers: {
            from,
            to: to.join(","),
            subject,
            date: parsedMessage.date || new Date().toISOString(),
          },
          snippet: parsedMessage.snippet || "",
          historyId: resourceData.id,
          inline: [],
          subject,
          date: parsedMessage.date
            ? new Date(parsedMessage.date).toISOString()
            : new Date().toISOString(),
          conversationIndex: parsedMessage.conversationIndex,
        },
        rules,
        emailAccount,
        isTest: false,
        modelType: "default",
      });
    }
  } catch (error) {
    // Handle item not found errors
    if (
      error instanceof Error &&
      (error.message.includes("ItemNotFound") ||
        error.message.includes("ResourceNotFound"))
    ) {
      logger.info("Message not found", loggerOptions);
      return;
    }

    throw error;
  }
}

async function handleOutbound(
  emailAccount: ProcessHistoryOptions["emailAccount"],
  parsedMessage: ParsedMessage,
  provider: EmailProvider,
  messageId: string,
  conversationId?: string | null,
) {
  const loggerOptions = {
    email: emailAccount.email,
    messageId,
    conversationId,
  };

  logger.info("Handling outbound reply", loggerOptions);

  // Run tracking and outbound reply handling concurrently
  // The individual functions handle their own operational errors.
  const [trackingResult, outboundResult] = await Promise.allSettled([
    trackSentDraftStatus({
      emailAccountId: emailAccount.id,
      message: parsedMessage,
      provider,
    }),
    handleOutboundReply({
      emailAccount,
      message: parsedMessage,
      provider,
    }),
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
      threadId: conversationId || messageId,
      emailAccountId: emailAccount.id,
      provider: provider,
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
