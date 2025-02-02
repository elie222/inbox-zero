import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";
import type { gmail_v1 } from "@googleapis/gmail";
import {
  labelAwaitingReply,
  removeAwaitingReplyLabel,
} from "@/utils/reply-tracker/consts";

export async function createReplyTrackerInbound(
  userId: string,
  threadId: string,
  messageId: string,
  gmail: gmail_v1.Gmail,
) {
  // Resolve existing AWAITING trackers
  const updateDbPromise = prisma.threadTracker.updateMany({
    where: {
      userId,
      threadId,
      type: ThreadTrackerType.AWAITING,
    },
    data: {
      resolved: true,
    },
  });

  const labelPromise = removeAwaitingReplyLabel(gmail, messageId);

  await Promise.allSettled([updateDbPromise, labelPromise]);

  // Create new NEEDS_REPLY tracker
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
      type: ThreadTrackerType.NEEDS_REPLY,
    },
  });

  const newLabelPromise = labelAwaitingReply(gmail, messageId);

  await Promise.allSettled([upsertPromise, newLabelPromise]);
}
