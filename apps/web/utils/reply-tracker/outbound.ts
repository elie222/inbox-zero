import type { gmail_v1 } from "@googleapis/gmail";
import type { UserEmailWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import { aiCheckIfNeedsReply } from "@/utils/ai/reply/check-if-needs-reply";
import prisma from "@/utils/prisma";
import { getThreadMessages } from "@/utils/gmail/thread";
import { ThreadTrackerType, type User } from "@prisma/client";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import {
  labelAwaitingReply,
  removeNeedsReplyLabel,
  getReplyTrackingLabels,
} from "@/utils/reply-tracker/label";
import { internalDateToDate } from "@/utils/date";
import { getReplyTrackingRule } from "@/utils/reply-tracker";

export async function handleOutboundReply(
  user: Pick<User, "id" | "about"> & UserEmailWithAI,
  message: ParsedMessage,
  gmail: gmail_v1.Gmail,
) {
  const userId = user.id;

  const enabled = (await getReplyTrackingRule(userId))?.trackReplies;

  // If reply tracking is disabled, skip
  if (!enabled) return;

  const logger = createScopedLogger("reply-tracker/outbound").with({
    email: user.email,
    userId: user.id,
    messageId: message.id,
    threadId: message.threadId,
  });

  logger.info("Checking outbound reply");

  const { awaitingReplyLabelId, needsReplyLabelId } =
    await getReplyTrackingLabels(gmail);

  // When we send a reply, resolve any existing "NEEDS_REPLY" trackers
  await resolveReplyTrackers(
    gmail,
    userId,
    message.threadId,
    needsReplyLabelId,
  );

  const threadMessages = await getThreadMessages(message.threadId, gmail);

  if (!threadMessages?.length) {
    logger.error("No thread messages found");
    return;
  }

  // ai: check if we need to reply
  const result = await aiCheckIfNeedsReply({
    user,
    messages: threadMessages.map((m, index) =>
      getEmailForLLM(m, {
        // give more context for the message we're processing
        maxLength: index === threadMessages.length - 1 ? 2000 : 500,
        extractReply: true,
        removeForwarded: false,
      }),
    ),
  });

  // if yes, create a tracker
  if (result.needsReply) {
    logger.info("Needs reply. Creating reply tracker outbound");
    await createReplyTrackerOutbound({
      gmail,
      userId,
      threadId: message.threadId,
      messageId: message.id,
      awaitingReplyLabelId,
      sentAt: internalDateToDate(message.internalDate),
      logger,
    });
  } else {
    logger.info("No need to reply");
  }
}

async function createReplyTrackerOutbound({
  gmail,
  userId,
  threadId,
  messageId,
  awaitingReplyLabelId,
  sentAt,
  logger,
}: {
  gmail: gmail_v1.Gmail;
  userId: string;
  threadId: string;
  messageId: string;
  awaitingReplyLabelId: string;
  sentAt: Date;
  logger: Logger;
}) {
  if (!threadId || !messageId) return;

  const upsertPromise = prisma.threadTracker.upsert({
    where: {
      userId_threadId_messageId: {
        userId,
        threadId,
        messageId,
      },
    },
    update: {},
    create: {
      userId,
      threadId,
      messageId,
      type: ThreadTrackerType.AWAITING,
      sentAt,
    },
  });

  const labelPromise = labelAwaitingReply(
    gmail,
    messageId,
    awaitingReplyLabelId,
  );

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
  gmail: gmail_v1.Gmail,
  userId: string,
  threadId: string,
  needsReplyLabelId: string,
) {
  const updateDbPromise = prisma.threadTracker.updateMany({
    where: {
      userId,
      threadId,
      resolved: false,
      type: ThreadTrackerType.NEEDS_REPLY,
    },
    data: {
      resolved: true,
    },
  });

  const labelPromise = removeNeedsReplyLabel(
    gmail,
    threadId,
    needsReplyLabelId,
  );

  await Promise.allSettled([updateDbPromise, labelPromise]);
}
