import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { ThreadTrackerType } from "@prisma/client";

const logger = createScopedLogger("google-webhook");

export async function handleOutboundReply(
  userId: string,
  message: gmail_v1.Schema$Message,
) {
  const threadId = message.threadId;
  const messageId = message.id;
  if (!threadId || !messageId) return;

  // When we send a reply, resolve any existing "NEEDS_REPLY" trackers
  const resolvedResult = await prisma.threadTracker.updateMany({
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

  if (resolvedResult.count > 0) {
    logger.info("Marked thread as replied to", {
      userId,
      threadId,
      messageId,
      messageCount: resolvedResult.count,
    });
  }

  // Create a new "AWAITING" tracker
  await prisma.threadTracker.upsert({
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
}

// TODO: not every email we get needs a reply. needs to be handled using AI
// Depends on the rules the user has
export async function handleInboundReply(
  userId: string,
  message: gmail_v1.Schema$Message,
) {
  const threadId = message.threadId;
  const messageId = message.id;
  if (!threadId || !messageId) return;

  await prisma.threadTracker.updateMany({
    where: {
      userId,
      threadId,
      type: ThreadTrackerType.AWAITING,
    },
    data: {
      resolved: true,
    },
  });

  await prisma.threadTracker.upsert({
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
      type: ThreadTrackerType.NEEDS_REPLY,
    },
  });
}
