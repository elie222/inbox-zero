import type { gmail_v1 } from "@googleapis/gmail";
import {
  GroupItemSource,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import {
  isGmailRateLimitExceededError,
  isGmailQuotaExceededError,
  isGmailInsufficientPermissionsError,
} from "@/utils/error";

/**
 * When the SPAM label is added (e.g. user marks as junk in Mail.app),
 * learn this sender as a cold email so future emails from them are
 * caught at Tier 1 without an AI call.
 */
export async function handleLabelAddedEvent(
  message: gmail_v1.Schema$HistoryLabelAdded,
  {
    emailAccount,
    provider,
  }: {
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
  },
  logger: Logger,
) {
  const messageId = message.message?.id;
  const threadId = message.message?.threadId;
  const emailAccountId = emailAccount.id;
  const addedLabelIds = message.labelIds || [];

  if (!messageId || !threadId) {
    logger.error("Skipping label added - missing messageId or threadId");
    return;
  }

  // Only learn from SPAM label additions
  if (!addedLabelIds.includes(GmailLabel.SPAM)) {
    logger.trace("Label added event is not SPAM, skipping", {
      messageId,
      addedLabelIds,
    });
    return;
  }

  logger.info("SPAM label added, learning cold email pattern", {
    messageId,
    threadId,
  });

  // Find the Cold Email rule for this account
  const coldEmailRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: SystemType.COLD_EMAIL,
      enabled: true,
    },
    select: { id: true, groupId: true },
  });

  if (!coldEmailRule) {
    logger.info("No Cold Email rule found for account, skipping");
    return;
  }

  let sender: string | null = null;

  try {
    const parsedMessage = await provider.getMessage(messageId);
    sender = extractEmailAddress(parsedMessage.headers.from);
  } catch (error) {
    const errorObj = error as {
      message?: string;
      error?: { message?: string };
    };
    const errorMessage = errorObj?.message || errorObj?.error?.message;
    if (errorMessage === "Requested entity was not found.") {
      logger.warn("Message not found - may have been deleted", { messageId });
      return;
    }

    if (isGmailRateLimitExceededError(error)) {
      logger.warn("Rate limit exceeded", { messageId });
      return;
    }

    if (isGmailQuotaExceededError(error)) {
      logger.warn("Quota exceeded", { messageId });
      return;
    }

    if (isGmailInsufficientPermissionsError(error)) {
      logger.warn("Insufficient permissions", { messageId });
      return;
    }

    logger.error("Error getting sender for label added", {
      messageId,
      error,
    });
    return;
  }

  if (!sender) {
    logger.info("No sender found, skipping learning");
    return;
  }

  // Don't overwrite existing patterns (e.g., AI classification)
  if (coldEmailRule.groupId) {
    const existing = await prisma.groupItem.findUnique({
      where: {
        groupId_type_value: {
          groupId: coldEmailRule.groupId,
          type: GroupItemType.FROM,
          value: sender,
        },
      },
      select: { id: true },
    });

    if (existing) {
      logger.trace("Sender already in cold email group, skipping", {
        sender,
      });
      return;
    }
  }

  logger.trace("Saving cold email learned pattern from SPAM action", {
    sender,
  });

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId: coldEmailRule.id,
    exclude: false,
    logger,
    messageId,
    threadId,
    reason: "Marked as spam by user",
    source: GroupItemSource.LABEL_ADDED,
  });
}
