import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { emailToContent, parseMessage } from "@/utils/mail";
import { GmailLabel } from "@/utils/gmail/label";
import { getMessage } from "@/utils/gmail/message";
import { runColdEmailBlocker } from "@/utils/cold-email/is-cold-email";
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules";
import { blockUnsubscribedEmails } from "@/app/api/google/webhook/block-unsubscribed-emails";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundReply } from "@/utils/reply-tracker/outbound";
import type { ProcessHistoryOptions } from "@/app/api/google/webhook/types";
import { ColdEmailSetting } from "@prisma/client";
import { logger } from "@/app/api/google/webhook/logger";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import { internalDateToDate } from "@/utils/date";

export async function processHistoryItem(
  {
    message,
  }: gmail_v1.Schema$HistoryMessageAdded | gmail_v1.Schema$HistoryLabelAdded,
  {
    gmail,
    email: userEmail,
    user,
    accessToken,
    hasColdEmailAccess,
    hasAutomationRules,
    hasAiAutomationAccess,
    rules,
  }: ProcessHistoryOptions,
) {
  const messageId = message?.id;
  const threadId = message?.threadId;

  if (!messageId || !threadId) return;

  const loggerOptions = {
    email: userEmail,
    messageId,
    threadId,
  };

  const isFree = await markMessageAsProcessing({ userEmail, messageId });

  if (!isFree) {
    logger.info("Skipping. Message already being processed.", loggerOptions);
    return;
  }

  logger.info("Getting message", loggerOptions);

  try {
    const [gmailMessage, hasExistingRule] = await Promise.all([
      getMessage(messageId, gmail, "full"),
      prisma.executedRule.findUnique({
        where: {
          unique_user_thread_message: { userId: user.id, threadId, messageId },
        },
        select: { id: true },
      }),
    ]);

    // if the rule has already been executed, skip
    if (hasExistingRule) {
      logger.info("Skipping. Rule already exists.", loggerOptions);
      return;
    }

    const message = parseMessage(gmailMessage);

    if (isIgnoredSender(message.headers.from)) {
      logger.info("Skipping. Ignored sender.", loggerOptions);
      return;
    }

    const isForAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: message.headers.to,
    });

    if (isForAssistant) {
      logger.info("Passing through assistant email.", loggerOptions);
      return processAssistantEmail({
        message,
        userEmail,
        userId: user.id,
        gmail,
      });
    }

    const isFromAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: message.headers.from,
    });

    if (isFromAssistant) {
      logger.info("Skipping. Assistant email.", loggerOptions);
      return;
    }

    const isOutbound = message.labelIds?.includes(GmailLabel.SENT);

    if (isOutbound) {
      await handleOutboundReply(user, message, gmail);
      // skip outbound emails
      return;
    }

    // check if unsubscribed
    const blocked = await blockUnsubscribedEmails({
      from: message.headers.from,
      userId: user.id,
      gmail,
      messageId,
    });

    if (blocked) {
      logger.info("Skipping. Blocked unsubscribed email.", loggerOptions);
      return;
    }

    const shouldRunBlocker = shouldRunColdEmailBlocker(
      user.coldEmailBlocker,
      hasColdEmailAccess,
    );

    if (shouldRunBlocker) {
      logger.info("Running cold email blocker...", loggerOptions);

      const content = emailToContent(message);

      const response = await runColdEmailBlocker({
        email: {
          from: message.headers.from,
          subject: message.headers.subject,
          content,
          messageId,
          threadId,
          date: internalDateToDate(message.internalDate),
        },
        gmail,
        user,
      });

      if (response.isColdEmail) {
        logger.info("Skipping. Cold email detected.", loggerOptions);
        return;
      }
    }

    // categorize a sender if we haven't already
    // this is used for category filters in ai rules
    if (user.autoCategorizeSenders) {
      const sender = message.headers.from;
      const existingSender = await prisma.newsletter.findUnique({
        where: { email_userId: { email: sender, userId: user.id } },
        select: { category: true },
      });
      if (!existingSender?.category) {
        await categorizeSender(sender, user, gmail, accessToken);
      }
    }

    if (hasAutomationRules && hasAiAutomationAccess) {
      logger.info("Running rules...", loggerOptions);

      await runRulesOnMessage({
        gmail,
        message,
        rules,
        user,
        isTest: false,
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

export function shouldRunColdEmailBlocker(
  coldEmailBlocker: ColdEmailSetting | null,
  hasColdEmailAccess: boolean,
) {
  return (
    (coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL ||
      coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
      coldEmailBlocker === ColdEmailSetting.LABEL) &&
    hasColdEmailAccess
  );
}
