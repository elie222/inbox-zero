import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ModelType } from "@/utils/llms/model";
import type {
  ParsedMessage,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { createScopedLogger } from "@/utils/logger";
import { SystemType, ThreadTrackerType } from "@prisma/client";
import prisma from "@/utils/prisma";

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
}: {
  conversationRules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  modelType: ModelType;
}): Promise<{
  specificRule: RuleWithActionsAndCategories | null;
  reason: string;
}> {
  logger.info("Determining conversation status", {
    messageId: message.id,
    threadId: message.threadId,
  });

  // Fetch thread messages for context
  const threadMessages = await provider.getThreadMessages(message.threadId);
  if (!threadMessages?.length) {
    logger.error("No thread messages found");
    return {
      specificRule: null,
      reason: "Failed to fetch thread messages",
    };
  }

  // Sort messages by date (most recent first)
  const sortedMessages = [...threadMessages].sort(
    (a, b) => (Number(b.internalDate) || 0) - (Number(a.internalDate) || 0),
  );

  // Prepare thread messages for AI analysis
  const threadMessagesForLLM = sortedMessages.map((m, index) =>
    getEmailForLLM(m, {
      maxLength: index === 0 ? 2000 : 500,
      extractReply: true,
      removeForwarded: false,
    }),
  );

  // AI determines thread status
  const { status, rationale } = await aiDetermineThreadStatus({
    emailAccount,
    threadMessages: threadMessagesForLLM,
  });

  logger.info("AI determined thread status", {
    status,
    rationale,
    messageId: message.id,
  });

  // Find the specific rule for this status
  const specificRule = conversationRules.find(
    (r) => r.systemType === status && r.enabled,
  );

  if (!specificRule) {
    logger.warn("No enabled rule found for determined status", {
      status,
      availableRules: conversationRules.map((r) => ({
        systemType: r.systemType,
        enabled: r.enabled,
      })),
    });
    return {
      specificRule: null,
      reason: `Conversation status determined as ${status}, but no enabled rule found`,
    };
  }

  return {
    specificRule,
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
  // First, resolve all existing trackers for this thread
  await prisma.threadTracker.updateMany({
    where: {
      emailAccountId,
      threadId,
      resolved: false,
    },
    data: {
      resolved: true,
    },
  });

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
