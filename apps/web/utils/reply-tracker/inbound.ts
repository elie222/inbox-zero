import prisma from "@/utils/prisma";
import { ActionType, ThreadTrackerType } from "@prisma/client";
import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import { internalDateToDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import type { OutlookClient } from "@/utils/outlook/client";
import { EmailProvider } from "@/utils/email/provider";

/**
 * Marks an email thread as needing a reply.
 * This function coordinates the process of:
 * 1. Updating thread trackers in the database
 * 2. Managing Gmail/Outlook labels
 */
export async function coordinateReplyProcess({
  emailAccountId,
  threadId,
  messageId,
  sentAt,
  client,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  sentAt: Date;
  client: EmailProvider;
}) {
  const logger = createScopedLogger("reply-tracker/inbound").with({
    emailAccountId,
    threadId,
    messageId,
  });

  logger.info("Marking thread as needs reply");

  // Process in parallel for better performance
  const dbPromise = updateThreadTrackers({
    emailAccountId,
    threadId,
    messageId,
    sentAt,
  });

  const labelsPromise = client.removeThreadLabel(
    threadId,
    await client.getAwaitingReplyLabel(),
  );

  const [dbResult, labelsResult] = await Promise.allSettled([
    dbPromise,
    labelsPromise,
  ]);

  if (dbResult.status === "rejected") {
    logger.error("Failed to mark needs reply", { error: dbResult.reason });
  }

  if (labelsResult.status === "rejected") {
    logger.error("Failed to update labels", {
      error: labelsResult.reason,
    });
  }
}

/**
 * Updates thread trackers in the database - resolves AWAITING trackers and creates a NEEDS_REPLY tracker
 */
async function updateThreadTrackers({
  emailAccountId,
  threadId,
  messageId,
  sentAt,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  sentAt: Date;
}) {
  return prisma.$transaction([
    // Resolve existing AWAITING trackers
    prisma.threadTracker.updateMany({
      where: {
        emailAccountId,
        threadId,
        type: ThreadTrackerType.AWAITING,
      },
      data: {
        resolved: true,
      },
    }),
    // Create new NEEDS_REPLY tracker
    prisma.threadTracker.upsert({
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
        type: ThreadTrackerType.NEEDS_REPLY,
        sentAt,
      },
    }),
  ]);
}

// Currently this is used when enabling reply tracking. Otherwise we use regular AI rule processing to handle inbound replies
export async function handleInboundReply({
  emailAccount,
  message,
  client,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  client: EmailProvider;
}) {
  // 1. Run rules check
  // 2. If the reply tracking rule is selected then mark as needs reply
  // We ignore the rest of the actions for this rule here as this could lead to double handling of emails for the user

  const replyTrackingRules = await prisma.rule.findMany({
    where: {
      emailAccountId: emailAccount.id,
      instructions: { not: null },
      actions: {
        some: {
          type: ActionType.TRACK_THREAD,
        },
      },
    },
  });

  if (replyTrackingRules.length === 0) return;

  const result = await aiChooseRule({
    email: getEmailForLLM(message),
    rules: replyTrackingRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      instructions: rule.instructions || "",
    })),
    emailAccount,
  });

  if (replyTrackingRules.some((rule) => rule.id === result.rule?.id)) {
    await coordinateReplyProcess({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      sentAt: internalDateToDate(message.internalDate),
      client,
    });
  }
}
