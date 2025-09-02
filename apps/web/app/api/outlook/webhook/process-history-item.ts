import type { Message } from "@microsoft/microsoft-graph-types";
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
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

export async function processHistoryItem(
  resourceData: OutlookResourceData,
  {
    client,
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
    const [message, hasExistingRule] = await Promise.all([
      client.api(`/me/messages/${messageId}`).get() as Promise<Message>,
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

    const from = message.from?.emailAddress?.address;
    const to =
      message.toRecipients
        ?.map((r) => r.emailAddress?.address)
        .filter(Boolean) || [];
    const subject = message.subject || "";

    if (!from) {
      logger.error("Message has no sender", loggerOptions);
      return;
    }

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider: "microsoft",
    });

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
            date: message.receivedDateTime
              ? new Date(message.receivedDateTime).toISOString()
              : new Date().toISOString(),
          },
          snippet: message.bodyPreview || "",
          historyId: resourceData.id,
          inline: [],
          subject,
          date: message.receivedDateTime
            ? new Date(message.receivedDateTime).toISOString()
            : new Date().toISOString(),
          conversationIndex: message.conversationIndex,
        },
        emailAccountId,
        userEmail,
        provider: emailProvider,
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

    const isOutbound =
      message.from?.emailAddress?.address?.toLowerCase() ===
      userEmail.toLowerCase();

    if (isOutbound) {
      await handleOutbound(
        emailAccount,
        message,
        emailProvider,
        messageId,
        resourceData.conversationId || undefined,
      );
      return;
    }

    // check if unsubscribed
    const blocked = await blockUnsubscribedEmails({
      from,
      emailAccountId,
      client,
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

      const content = message.body?.content || "";

      const response = await runColdEmailBlocker({
        email: {
          from,
          to: to.join(","),
          subject,
          content,
          id: messageId,
          threadId: resourceData.conversationId || messageId,
          date: message.receivedDateTime
            ? new Date(message.receivedDateTime)
            : new Date(),
        },
        provider: emailProvider,
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
        await categorizeSender(sender, emailAccount, emailProvider);
      }
    }

    if (hasAutomationRules && hasAiAccess) {
      logger.info("Running rules...", loggerOptions);

      await runRules({
        client: emailProvider,
        message: {
          id: messageId,
          threadId: resourceData.conversationId || messageId,
          headers: {
            from,
            to: to.join(","),
            subject,
            date: message.receivedDateTime
              ? new Date(message.receivedDateTime).toISOString()
              : new Date().toISOString(),
          },
          snippet: message.bodyPreview || "",
          historyId: resourceData.id,
          inline: [],
          subject,
          date: message.receivedDateTime
            ? new Date(message.receivedDateTime).toISOString()
            : new Date().toISOString(),
          conversationIndex: message.conversationIndex,
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
  message: Message,
  provider: EmailProvider,
  messageId: string,
  conversationId?: string,
) {
  const loggerOptions = {
    email: emailAccount.email,
    messageId,
    conversationId,
  };

  logger.info("Handling outbound reply", loggerOptions);

  const messageHeaders = {
    from: message.from?.emailAddress?.address || "",
    to:
      message.toRecipients?.map((r) => r.emailAddress?.address).join(",") || "",
    subject: message.subject || "",
    date: message.receivedDateTime
      ? new Date(message.receivedDateTime).toISOString()
      : new Date().toISOString(),
  };

  const parsedMessage = {
    id: messageId,
    threadId: conversationId || messageId,
    headers: messageHeaders,
    snippet: message.bodyPreview || "",
    historyId: message.id || messageId,
    inline: [],
    subject: message.subject || "",
    date: message.receivedDateTime
      ? new Date(message.receivedDateTime).toISOString()
      : new Date().toISOString(),
    conversationIndex: message.conversationIndex,
  };

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
