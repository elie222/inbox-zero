import { SENDING_ACTION_TYPES } from "@/utils/ai/sending-action";
import prisma from "@/utils/prisma";

// The retry route spans about 90 seconds, leaving time for a racing send to
// finish without allowing a permanently incomplete action to block replies.
const MESSAGE_ATTRIBUTION_PENDING_MS = 60_000;

export async function isRuleGeneratedMessage({
  emailAccountId,
  threadId,
  messageId,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
}) {
  const pendingSince = new Date(Date.now() - MESSAGE_ATTRIBUTION_PENDING_MS);
  const candidates = await prisma.executedAction.findMany({
    where: {
      type: { in: SENDING_ACTION_TYPES },
      executedRule: { emailAccountId, threadId },
      OR: [
        { sentMessageIds: { has: messageId } },
        {
          executionStartedAt: { gte: pendingSince },
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

  if (
    candidates.some(
      ({ executionStartedAt }) =>
        executionStartedAt && executionStartedAt >= pendingSince,
    )
  ) {
    throw new Error("Message attribution is still pending");
  }

  return false;
}
