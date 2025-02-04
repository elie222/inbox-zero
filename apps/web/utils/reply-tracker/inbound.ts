import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";
import type { gmail_v1 } from "@googleapis/gmail";
import {
  labelNeedsReply,
  removeAwaitingReplyLabel,
  getReplyTrackingLabels,
} from "@/utils/reply-tracker/label";

export async function markNeedsReply(
  userId: string,
  threadId: string,
  messageId: string,
  sentAt: Date,
  gmail: gmail_v1.Gmail,
) {
  const { awaitingReplyLabelId, needsReplyLabelId } =
    await getReplyTrackingLabels(gmail);

  const dbPromise = prisma.$transaction([
    // Resolve existing AWAITING trackers
    prisma.threadTracker.updateMany({
      where: {
        userId,
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
        sentAt,
      },
    }),
  ]);

  const removeLabelPromise = removeAwaitingReplyLabel(
    gmail,
    threadId,
    awaitingReplyLabelId,
  );
  const newLabelPromise = labelNeedsReply(gmail, messageId, needsReplyLabelId);

  await Promise.allSettled([dbPromise, removeLabelPromise, newLabelPromise]);
}
