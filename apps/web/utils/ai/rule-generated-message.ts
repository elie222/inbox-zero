import { SENDING_ACTION_TYPES } from "@/utils/ai/sending-action";
import prisma from "@/utils/prisma";

const ATTRIBUTION_PENDING_WINDOW_MS = 10 * 60 * 1000;

export async function isRuleGeneratedMessage({
  emailAccountId,
  threadId,
  messageId,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
}) {
  const candidates = await prisma.executedAction.findMany({
    where: {
      type: { in: SENDING_ACTION_TYPES },
      executedRule: { emailAccountId, threadId },
      OR: [
        { sentMessageIds: { has: messageId } },
        {
          executionStartedAt: {
            gte: new Date(Date.now() - ATTRIBUTION_PENDING_WINDOW_MS),
          },
          executionStatus: null,
        },
      ],
    },
    select: {
      executionStartedAt: true,
      sentMessageIds: true,
    },
  });

  if (
    candidates.some(({ sentMessageIds }) => sentMessageIds.includes(messageId))
  ) {
    return true;
  }

  if (candidates.some(({ executionStartedAt }) => executionStartedAt)) {
    throw new Error("Message attribution is still pending");
  }

  return false;
}
