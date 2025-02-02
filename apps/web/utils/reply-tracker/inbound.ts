import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";

export async function createReplyTrackerInbound(
  userId: string,
  threadId: string,
  messageId: string,
) {
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
