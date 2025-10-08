import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { emailToContent } from "@/utils/mail";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { runColdEmailBlocker } from "@/utils/cold-email/is-cold-email";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { blockUnsubscribedEmails as blockUnsubscribedEmailsGoogle } from "@/app/api/google/webhook/block-unsubscribed-emails";
import { blockUnsubscribedEmails as blockUnsubscribedEmailsOutlook } from "@/app/api/outlook/webhook/block-unsubscribed-emails";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundMessage } from "@/utils/reply-tracker/handle-outbound";
import { ColdEmailSetting } from "@prisma/client";
import { internalDateToDate } from "@/utils/date";
import { extractEmailAddress } from "@/utils/email";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import { enqueueDigestItem } from "@/utils/digest/index";
import type { EmailProvider } from "@/utils/email/types";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";
import type { Logger } from "@/utils/logger";

export type SharedProcessHistoryOptions = {
  provider: EmailProvider;
  rules: RuleWithActionsAndCategories[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: Pick<
    EmailAccount,
    "coldEmailPrompt" | "coldEmailBlocker" | "autoCategorizeSenders"
  > &
    EmailAccountWithAI & {
      coldEmailDigest?: boolean | null;
    };
  // Google-specific options
  gmail?: gmail_v1.Gmail;
  // Logger with context
  logger: Logger;
};

export async function processHistoryItem(
  {
    messageId,
    threadId,
  }: {
    messageId: string;
    threadId?: string;
  },
  options: SharedProcessHistoryOptions,
) {
  const {
    provider,
    emailAccount,
    hasAutomationRules,
    hasAiAccess,
    rules,
    gmail,
    logger,
  } = options;

  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;
  const isGoogle = provider.name === "google";

  const isFree = await markMessageAsProcessing({ userEmail, messageId });

  if (!isFree) {
    logger.info("Skipping. Message already being processed.");
    return;
  }

  logger.info("Getting message");

  try {
    const [parsedMessage, hasExistingRule] = await Promise.all([
      provider.getMessage(messageId),
      threadId
        ? prisma.executedRule.findUnique({
            where: {
              unique_emailAccount_thread_message: {
                emailAccountId,
                threadId,
                messageId,
              },
            },
            select: { id: true },
          })
        : null,
    ]);

    // Get threadId from message if not provided
    const actualThreadId = threadId || parsedMessage.threadId;

    // Re-check with actual threadId if we didn't have it initially
    const finalHasExistingRule =
      hasExistingRule !== null
        ? hasExistingRule
        : actualThreadId
          ? await prisma.executedRule.findUnique({
              where: {
                unique_emailAccount_thread_message: {
                  emailAccountId,
                  threadId: actualThreadId,
                  messageId,
                },
              },
              select: { id: true },
            })
          : null;

    // if the rule has already been executed, skip
    if (finalHasExistingRule) {
      logger.info("Skipping. Rule already exists.");
      return;
    }

    if (isIgnoredSender(parsedMessage.headers.from)) {
      logger.info("Skipping. Ignored sender.");
      return;
    }

    // Outlook-specific: Skip messages that are not in inbox or sent items folders
    if (!isGoogle) {
      const isInInbox = parsedMessage.labelIds?.includes("INBOX") || false;
      const isInSentItems = parsedMessage.labelIds?.includes("SENT") || false;

      if (!isInInbox && !isInSentItems) {
        logger.info("Skipping message not in inbox or sent items");
        return;
      }
    }

    const isForAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.to,
    });

    if (isForAssistant) {
      logger.info("Passing through assistant email.");
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
      logger.info("Skipping. Assistant email.");
      return;
    }

    const isOutbound = provider.isSentMessage(parsedMessage);

    if (isOutbound) {
      await handleOutboundMessage({
        emailAccount,
        message: parsedMessage,
        provider,
      });
      return;
    }

    // check if unsubscribed
    const blocked =
      isGoogle && gmail
        ? await blockUnsubscribedEmailsGoogle({
            from: parsedMessage.headers.from,
            emailAccountId,
            gmail,
            messageId,
          })
        : await blockUnsubscribedEmailsOutlook({
            from: parsedMessage.headers.from,
            emailAccountId,
            messageId,
            provider,
            ownerEmail: userEmail,
          });

    if (blocked) {
      logger.info("Skipping. Blocked unsubscribed email.");
      return;
    }

    const shouldRunBlocker = shouldRunColdEmailBlocker(
      emailAccount.coldEmailBlocker,
      hasAiAccess,
    );

    if (shouldRunBlocker) {
      logger.info("Running cold email blocker...");

      const emailForBlocker = isGoogle
        ? {
            from: parsedMessage.headers.from,
            to: "",
            subject: parsedMessage.headers.subject,
            content: emailToContent(parsedMessage),
            id: messageId,
            threadId: actualThreadId,
            date: internalDateToDate(parsedMessage.internalDate),
          }
        : {
            ...getEmailForLLM(parsedMessage),
            threadId: actualThreadId,
            date: parsedMessage.date
              ? new Date(parsedMessage.date)
              : new Date(),
          };

      const response = await runColdEmailBlocker({
        email: emailForBlocker,
        provider,
        emailAccount,
        modelType: "default",
      });

      if (response.isColdEmail) {
        // Google-specific: enqueue cold email for digest
        if (isGoogle && emailAccount.coldEmailDigest && response.coldEmailId) {
          logger.info("Enqueuing a cold email digest item", {
            coldEmailId: response.coldEmailId,
          });
          await enqueueDigestItem({
            email: parsedMessage,
            emailAccountId,
            coldEmailId: response.coldEmailId,
          });
        }
        logger.info("Skipping. Cold email detected.");
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
        await categorizeSender(sender, emailAccount, provider);
      }
    }

    if (hasAutomationRules && hasAiAccess) {
      logger.info("Running rules...");

      await runRules({
        provider,
        message: parsedMessage,
        rules,
        emailAccount,
        isTest: false,
        modelType: "default",
      });
    }
  } catch (error: unknown) {
    // Handle provider-specific "not found" errors
    if (error instanceof Error) {
      const isGoogleNotFound =
        error.message === "Requested entity was not found.";
      const isOutlookNotFound =
        error.message.includes("ItemNotFound") ||
        error.message.includes("ResourceNotFound");

      if (isGoogleNotFound || isOutlookNotFound) {
        logger.info("Message not found");
        return;
      }
    }

    throw error;
  }
}

function shouldRunColdEmailBlocker(
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
