import type { gmail_v1 } from "@googleapis/gmail";
import type { UserEmailWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import { aiCheckIfNeedsReply } from "@/utils/ai/reply/check-if-needs-reply";
import prisma from "@/utils/prisma";
import { getThreadMessages } from "@/utils/gmail/thread";
import { ThreadTrackerType, type User } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { getEmailForLLM } from "@/utils/ai/choose-rule/get-email-from-message";
import {
  labelAwaitingReply,
  removeNeedsReplyLabel,
  getReplyTrackingLabels,
} from "@/utils/reply-tracker/label";
import { internalDateToDate } from "@/utils/date";

const logger = createScopedLogger("outbound-reply");

export async function handleOutboundReply(
  user: Pick<User, "id" | "about"> & UserEmailWithAI,
  message: ParsedMessage,
  gmail: gmail_v1.Gmail,
) {
  const userId = user.id;

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
    logger.error("No thread messages found", {
      email: user.email,
      messageId: message.id,
      threadId: message.threadId,
    });
    return;
  }

  // ai: check if we need to reply
  const result = await aiCheckIfNeedsReply({
    user,
    messages: threadMessages.map(getEmailForLLM),
  });

  // if yes, create a tracker
  if (result.needsReply) {
    await createReplyTrackerOutbound({
      gmail,
      userId,
      threadId: message.threadId,
      messageId: message.id,
      awaitingReplyLabelId,
      sentAt: internalDateToDate(message.internalDate),
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
}: {
  gmail: gmail_v1.Gmail;
  userId: string;
  threadId: string;
  messageId: string;
  awaitingReplyLabelId: string;
  sentAt: Date;
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

  const errorOptions = {
    userId,
    threadId,
    messageId,
  };

  if (upsertResult.status === "rejected") {
    logger.error("Failed to upsert reply tracker", {
      ...errorOptions,
      error: upsertResult.reason,
    });
  }

  if (labelResult.status === "rejected") {
    logger.error("Failed to label reply tracker", {
      ...errorOptions,
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
