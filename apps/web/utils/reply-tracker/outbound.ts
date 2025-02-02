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
} from "@/utils/reply-tracker/label";

const logger = createScopedLogger("outbound-reply");

export async function handleOutboundReply(
  user: Pick<User, "id" | "about"> & UserEmailWithAI,
  message: ParsedMessage,
  gmail: gmail_v1.Gmail,
) {
  const userId = user.id;

  // When we send a reply, resolve any existing "NEEDS_REPLY" trackers
  await resolveReplyTrackers(gmail, userId, message.threadId, message.id);

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
    await createReplyTrackerOutbound(
      gmail,
      userId,
      message.threadId,
      message.id,
    );
  } else {
    console.log("No need to reply");
  }
}

async function createReplyTrackerOutbound(
  gmail: gmail_v1.Gmail,
  userId: string,
  threadId: string,
  messageId: string,
) {
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
    },
  });

  const labelPromise = labelAwaitingReply(gmail, messageId);

  await Promise.allSettled([upsertPromise, labelPromise]);
}

async function resolveReplyTrackers(
  gmail: gmail_v1.Gmail,
  userId: string,
  threadId: string,
  messageId: string,
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

  const labelPromise = removeNeedsReplyLabel(gmail, threadId);

  await Promise.allSettled([updateDbPromise, labelPromise]);
}
