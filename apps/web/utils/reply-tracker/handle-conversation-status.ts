import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ModelType } from "@/utils/llms/model";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { createScopedLogger } from "@/utils/logger";
import { SystemType, ThreadTrackerType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { sortByInternalDate } from "@/utils/date";
import { withPrismaRetry } from "@/utils/prisma-retry";

const logger = createScopedLogger("conversation-status-handler");

/**
 * Determines which conversation status sub-rule applies.
 * Returns the specific rule and reason, but does NOT execute any actions.
 * Execution happens through the normal rule execution flow.
 */
export async function determineConversationStatus({
  conversationRules,
  message,
  emailAccount,
  provider,
  modelType,
  isTest = false,
}: {
  conversationRules: RuleWithActions[];
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  modelType: ModelType;
  isTest?: boolean;
}): Promise<{
  rule: RuleWithActions | null;
  reason: string;
}> {
  logger.info("Determining conversation status", {
    messageId: message.id,
    threadId: message.threadId,
    isTest,
  });

  // For test messages with fake IDs, skip the API call and use the message itself as the thread
  const threadMessages = isTest
    ? [message]
    : await provider.getThreadMessages(message.threadId);

  if (!threadMessages?.length) {
    logger.error("No thread messages found");
    return {
      rule: null,
      reason: "Failed to fetch thread messages",
    };
  }

  const sortedMessages = [...threadMessages].sort(sortByInternalDate());

  const threadMessagesForLLM = sortedMessages.map((m, index) =>
    getEmailForLLM(m, {
      maxLength: index === sortedMessages.length - 1 ? 2000 : 500,
      extractReply: true,
      removeForwarded: false,
    }),
  );

  // Check if the user sent the last email in the thread
  const lastMessage = sortedMessages.at(-1);
  const userSentLastEmail = lastMessage
    ? provider.isSentMessage(lastMessage)
    : false;

  const { status, rationale } = await aiDetermineThreadStatus({
    emailAccount,
    threadMessages: threadMessagesForLLM,
    modelType,
    userSentLastEmail,
    conversationRules,
  });

  logger.info("AI determined thread status", {
    status,
    rationale,
    messageId: message.id,
  });

  const rule = conversationRules.find(
    (r) => r.systemType === status && r.enabled,
  );

  if (!rule) {
    logger.info("No enabled rule found for determined status", {
      status,
      availableRules: conversationRules.map((r) => ({
        systemType: r.systemType,
        enabled: r.enabled,
      })),
    });
    return {
      rule: null,
      reason: `Conversation status determined as ${status}, but no rule enabled for this status`,
    };
  }

  return {
    rule,
    reason: rationale,
  };
}

export async function updateThreadTrackers({
  emailAccountId,
  threadId,
  messageId,
  sentAt,
  status,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  sentAt: Date;
  status: SystemType;
}) {
  // Resolve all existing trackers for this thread
  await withPrismaRetry(
    () =>
      prisma.threadTracker.updateMany({
        where: {
          emailAccountId,
          threadId,
          resolved: false,
        },
        data: {
          resolved: true,
        },
      }),
    { logger },
  );

  const getTrackerType = (status: SystemType) => {
    if (status === SystemType.TO_REPLY) return ThreadTrackerType.NEEDS_REPLY;
    if (status === SystemType.AWAITING_REPLY) return ThreadTrackerType.AWAITING;

    // For FYI and ACTIONED, we just resolve trackers (nothing to create)
    return null;
  };

  const trackerType = getTrackerType(status);

  if (trackerType) {
    await prisma.threadTracker.upsert({
      where: {
        emailAccountId_threadId_messageId: {
          emailAccountId,
          threadId,
          messageId,
        },
      },
      update: {},
      create: {
        emailAccountId,
        threadId,
        messageId,
        type: trackerType,
        sentAt,
      },
    });
  }
}
