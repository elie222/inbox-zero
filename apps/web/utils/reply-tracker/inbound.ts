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
  gmail: gmail_v1.Gmail,
) {
  const { awaitingReplyLabelId, needsReplyLabelId } =
    await getReplyTrackingLabels(gmail);

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

  // Create new NEEDS_REPLY tracker
  const upsertDbPromise = prisma.threadTracker.upsert({
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

  const removeLabelPromise = removeAwaitingReplyLabel(
    gmail,
    threadId,
    awaitingReplyLabelId,
  );
  const newLabelPromise = labelNeedsReply(gmail, messageId, needsReplyLabelId);

  await Promise.allSettled([
    updateDbPromise,
    upsertDbPromise,
    removeLabelPromise,
    newLabelPromise,
  ]);
}
