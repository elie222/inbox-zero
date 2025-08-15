import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { emailToContent } from "@/utils/mail";
import { GmailLabel, getLabelById } from "@/utils/gmail/label";
import { runColdEmailBlockerWithProvider } from "@/utils/cold-email/is-cold-email";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { blockUnsubscribedEmails } from "@/app/api/google/webhook/block-unsubscribed-emails";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type { ProcessHistoryOptions } from "@/app/api/google/webhook/types";
import { ActionType, ColdEmailSetting, ColdEmailStatus } from "@prisma/client";
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
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import type { EmailProvider } from "@/utils/email/types";
import { inboxZeroLabels } from "@/utils/label";

export async function processHistoryItem(
  item:
    | gmail_v1.Schema$HistoryMessageAdded
    | gmail_v1.Schema$HistoryLabelAdded
    | gmail_v1.Schema$HistoryLabelRemoved,
  {
    gmail,
    emailAccount,
    accessToken,
    hasAutomationRules,
    hasAiAccess,
    rules,
  }: ProcessHistoryOptions,
) {
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

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: "google",
  });

  // No need for deduping here because the label removal is idempotent
  if ("labelIds" in item && item.labelIds && item.labelIds.length > 0) {
    logger.info("Processing label event for learning", loggerOptions);
    return handleLabelRemovedEvent(item, {
      gmail,
      emailAccount,
      emailProvider,
    });
  }

  const isFree = await markMessageAsProcessing({ userEmail, messageId });

  if (!isFree) {
    logger.info("Skipping. Message already being processed.", loggerOptions);
    return;
  }

  logger.info("Getting message", loggerOptions);

  try {
    const [parsedMessage, hasExistingRule] = await Promise.all([
      emailProvider.getMessage(messageId),
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
        provider: emailProvider,
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
        provider: emailProvider,
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
        client: emailProvider,
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

async function handleLabelRemovedEvent(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    gmail,
    emailAccount,
    emailProvider,
  }: {
    gmail: gmail_v1.Gmail;
    emailAccount: EmailAccountWithAI;
    emailProvider: EmailProvider;
  },
) {
  const messageId = message.message?.id;
  const threadId = message.message?.threadId;
  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  if (!messageId || !threadId) {
    logger.info("Skipping label removal - missing messageId or threadId", {
      userEmail,
      messageId,
      threadId,
    });
    return;
  }

  const loggerOptions = {
    email: userEmail,
    messageId,
    threadId,
  };

  logger.info("Processing label removal for learning", loggerOptions);

  try {
    const parsedMessage = await emailProvider.getMessage(messageId);
    const sender = extractEmailAddress(parsedMessage.headers.from);

    // For label removal, we need to get the labelIds from the HistoryLabelRemoved object
    const removedLabelIds = message.labelIds || [];
    const removedLabels = await Promise.all(
      removedLabelIds.map((labelId: string) =>
        getLabelById({ gmail, id: labelId }),
      ),
    );
    const removedLabelNames = removedLabels
      .map((label: gmail_v1.Schema$Label) => label?.name)
      .filter((label: string | null | undefined): label is string => !!label);

    for (const labelName of removedLabelNames) {
      await learnFromRemovedLabel({
        labelName,
        sender,
        messageId,
        threadId,
        emailAccountId,
        gmail,
      });
    }
  } catch (error) {
    logger.error("Error processing label removal", { error, ...loggerOptions });
  }
}

async function learnFromRemovedLabel({
  labelName,
  sender,
  messageId,
  threadId,
  emailAccountId,
  gmail,
}: {
  labelName: string;
  sender: string | null;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  gmail: gmail_v1.Gmail;
}) {
  const loggerOptions = {
    emailAccountId,
    messageId,
    threadId,
    labelName,
    sender,
  };

  // Can't learn patterns without knowing who to exclude
  if (!sender) {
    logger.info("No sender found, skipping learning", loggerOptions);
    return;
  }

  if (labelName === inboxZeroLabels.cold_email.name) {
    logger.info("Processing Cold Email label removal", loggerOptions);

    await prisma.coldEmail.upsert({
      where: {
        emailAccountId_fromEmail: {
          emailAccountId,
          fromEmail: sender,
        },
      },
      update: {
        status: ColdEmailStatus.USER_REJECTED_COLD,
      },
      create: {
        status: ColdEmailStatus.USER_REJECTED_COLD,
        fromEmail: sender,
        emailAccountId,
        messageId,
        threadId,
      },
    });

    // Remove Cold Email label from current thread and re-add INBOX if needed
    try {
      const coldEmailLabel = await getLabelById({ gmail, id: "INBOX" });
      if (coldEmailLabel?.id) {
        await gmail.users.threads.modify({
          userId: "me",
          id: threadId,
          requestBody: {
            addLabelIds: ["INBOX"],
          },
        });
      }
    } catch (error) {
      logger.warn("Could not re-add INBOX label", { error, ...loggerOptions });
    }

    return;
  }

  // Should not learn from labels that were not applied by our rules
  // So there should be an executed rule for this message
  const executedRule = await prisma.executedRule.findUnique({
    where: {
      unique_emailAccount_thread_message: {
        emailAccountId,
        threadId,
        messageId,
      },
    },
    include: {
      rule: {
        include: {
          actions: true,
        },
      },
    },
  });

  if (!executedRule || !executedRule.rule) {
    logger.info(
      "No executed rule found for message, skipping learning",
      loggerOptions,
    );
    return;
  }

  const hasMatchingLabelAction = executedRule.rule.actions.some(
    (action) => action.type === ActionType.LABEL && action.label === labelName,
  );

  // Label has been changed already
  if (!hasMatchingLabelAction) {
    logger.info(
      "No matching LABEL action found for removed label, skipping learning",
      loggerOptions,
    );
    return;
  }

  // Don't learn from To Reply rules
  if (executedRule.rule.systemType === "TO_REPLY") {
    logger.info("Skipping learning for To Reply rule", loggerOptions);
    return;
  }

  logger.info("Saving learned exclusion pattern", loggerOptions);
  try {
    await saveLearnedPatterns({
      emailAccountId,
      ruleName: executedRule.rule.name,
      patterns: [
        {
          type: "FROM",
          value: sender,
          exclude: true,
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to save learned exclusion pattern", {
      error,
      ...loggerOptions,
    });
  }
}
