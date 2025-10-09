import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import { internalDateToDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { filterToReplyPreset } from "@/utils/ai/choose-rule/match-rules";
import type { EmailProvider } from "@/utils/email/types";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import { applyThreadStatusLabel } from "./label-helpers";
import { updateThreadTrackers } from "@/utils/reply-tracker/handle-conversation-status";

/**
 * Analyzes an inbound email thread and applies the appropriate status label.
 * This function:
 * 1. Fetches full thread context
 * 2. Uses AI to determine thread status
 * 3. Applies the appropriate label with mutual exclusivity
 * 4. Updates thread trackers in the database
 */
export async function coordinateReplyProcess({
  emailAccountId,
  threadId,
  messageId,
  sentAt,
  client,
  emailAccount,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  sentAt: Date;
  client: EmailProvider;
  emailAccount?: EmailAccountWithAI;
}) {
  const logger = createScopedLogger("reply-tracker/inbound").with({
    emailAccountId,
    threadId,
    messageId,
  });

  logger.info("Determining thread status for inbound message");

  // If emailAccount not provided, fetch it
  const account =
    emailAccount ||
    (await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      include: { user: true },
    }));

  if (!account) {
    logger.error("Email account not found");
    return;
  }

  // Fetch thread messages for context
  const threadMessages = await client.getThreadMessages(threadId);
  if (!threadMessages?.length) {
    logger.error("No thread messages found");
    return;
  }

  // Find the actual message in the thread
  const message = threadMessages.find((m) => m.id === messageId);
  if (!message) {
    logger.error("Message not found in thread");
    return;
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

  const latestMessageForLLM = threadMessagesForLLM[0];
  if (!latestMessageForLLM) {
    logger.error("No latest message for AI analysis");
    return;
  }

  // AI determines thread status based on full context
  const aiResult = await aiDetermineThreadStatus({
    emailAccount: account as EmailAccountWithAI,
    threadMessages: threadMessagesForLLM,
  });

  logger.info("AI determined thread status", {
    status: aiResult.status,
    rationale: aiResult.rationale,
  });

  await applyThreadStatusLabel({
    emailAccountId,
    threadId,
    messageId,
    status: aiResult.status,
    provider: client,
  });

  await updateThreadTrackers({
    emailAccountId,
    threadId,
    messageId,
    sentAt,
    status: aiResult.status,
  });
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

  const filteredRules = await filterToReplyPreset(
    replyTrackingRules,
    message,
    client,
  );

  if (filteredRules.length === 0) return;

  const result = await aiChooseRule({
    email: getEmailForLLM(message),
    rules: filteredRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      instructions: rule.instructions || "",
    })),
    emailAccount,
  });

  if (filteredRules.some((rule) => rule.id === result.rule?.id)) {
    await coordinateReplyProcess({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      sentAt: internalDateToDate(message.internalDate),
      client,
      emailAccount,
    });
  }
}
