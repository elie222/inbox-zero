import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM, ParsedMessage } from "@/utils/types";
import { aiCheckIfNeedsReply } from "@/utils/ai/reply/check-if-needs-reply";
import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { internalDateToDate } from "@/utils/date";
import type { EmailProvider } from "@/utils/email/types";

export async function handleOutboundReply({
  emailAccount,
  message,
  provider,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  provider: EmailProvider;
}) {
  const logger = createScopedLogger("reply-tracker/outbound").with({
    email: emailAccount.email,
    messageId: message.id,
    threadId: message.threadId,
  });

  const isEnabled = await isOutboundTrackingEnabled({
    email: emailAccount.email,
  });
  if (!isEnabled) {
    logger.info("Outbound reply tracking disabled, skipping.");
    return;
  }

  logger.info("Checking outbound reply");

  // Resolve existing NEEDS_REPLY trackers for this thread
  await resolveReplyTrackers(provider, emailAccount.userId, message.threadId);

  const threadMessages = await provider.getThreadMessages(message.threadId);
  if (!threadMessages?.length) {
    logger.error("No thread messages found, cannot proceed.");
    return;
  }

  const { isLatest, sortedMessages } = isMessageLatestInThread(
    message,
    threadMessages,
    logger,
  );
  if (!isLatest) {
    logger.info(
      "Skipping outbound reply check: message is not the latest in the thread",
    );
    return; // Stop processing if not the latest
  }

  const { messageToSendForLLM, threadContextMessagesForLLM } =
    prepareDataForAICheck(message, sortedMessages);

  const aiResult = await aiCheckIfNeedsReply({
    emailAccount,
    messageToSend: messageToSendForLLM,
    threadContextMessages: threadContextMessagesForLLM,
  });

  if (aiResult.needsReply) {
    logger.info("Needs reply. Creating reply tracker outbound");

    await createReplyTrackerOutbound({
      provider,
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      sentAt: internalDateToDate(message.internalDate),
      logger,
    });
  } else {
    logger.trace("No need to reply");
  }
}

async function createReplyTrackerOutbound({
  provider,
  emailAccountId,
  threadId,
  messageId,
  sentAt,
  logger,
}: {
  provider: EmailProvider;
  emailAccountId: string;
  threadId: string;
  messageId: string;
  sentAt: Date;
  logger: Logger;
}) {
  if (!threadId || !messageId) return;

  const upsertPromise = prisma.threadTracker.upsert({
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
      type: ThreadTrackerType.AWAITING,
      sentAt,
    },
  });

  const labelPromise = provider.labelAwaitingReply(messageId);

  const [upsertResult, labelResult] = await Promise.allSettled([
    upsertPromise,
    labelPromise,
  ]);

  if (upsertResult.status === "rejected") {
    logger.error("Failed to upsert reply tracker", {
      error: upsertResult.reason,
    });
  }

  if (labelResult.status === "rejected") {
    logger.error("Failed to label reply tracker", {
      error: labelResult.reason,
    });
  }
}

async function resolveReplyTrackers(
  provider: EmailProvider,
  emailAccountId: string,
  threadId: string,
) {
  const updateDbPromise = prisma.threadTracker.updateMany({
    where: {
      emailAccountId,
      threadId,
      resolved: false,
      type: ThreadTrackerType.NEEDS_REPLY,
    },
    data: {
      resolved: true,
    },
  });

  const labelPromise = provider.removeNeedsReplyLabel(threadId);

  await Promise.allSettled([updateDbPromise, labelPromise]);
}

async function isOutboundTrackingEnabled({
  email,
}: {
  email: string;
}): Promise<boolean> {
  const userSettings = await prisma.emailAccount.findUnique({
    where: { email },
    select: { outboundReplyTracking: true },
  });
  return !!userSettings?.outboundReplyTracking;
}

function isMessageLatestInThread(
  message: ParsedMessage,
  threadMessages: ParsedMessage[],
  logger: Logger,
): { isLatest: boolean; sortedMessages: ParsedMessage[] } {
  if (!threadMessages.length) return { isLatest: false, sortedMessages: [] }; // Should not happen if called correctly

  const sortedMessages = [...threadMessages].sort(
    (a, b) => (Number(b.internalDate) || 0) - (Number(a.internalDate) || 0),
  );
  const actualLatestMessage = sortedMessages[0];

  if (actualLatestMessage?.id !== message.id) {
    logger.warn(
      "Skipping outbound reply check: message is not the latest in the thread",
      {
        processingMessageId: message.id,
        actualLatestMessageId: actualLatestMessage?.id,
      },
    );
    return { isLatest: false, sortedMessages };
  }
  return { isLatest: true, sortedMessages };
}

function prepareDataForAICheck(
  message: ParsedMessage,
  sortedThreadMessages: ParsedMessage[],
): {
  messageToSendForLLM: EmailForLLM;
  threadContextMessagesForLLM: EmailForLLM[];
} {
  const messageToSendForLLM = getEmailForLLM(message, {
    maxLength: 2000, // Give more context for the message we're processing
    extractReply: true,
    removeForwarded: false,
  });

  // Filter out the current message and take the next latest 2 messages for context
  const threadContextMessagesForLLM = sortedThreadMessages
    .filter((m) => m.id !== message.id) // Exclude the message just sent
    .slice(0, 2) // Take the latest 2 messages from the sorted list
    .map((m) =>
      getEmailForLLM(m, {
        maxLength: 500, // Shorter context for previous messages
        extractReply: true,
        removeForwarded: false,
      }),
    );

  return { messageToSendForLLM, threadContextMessagesForLLM };
}
