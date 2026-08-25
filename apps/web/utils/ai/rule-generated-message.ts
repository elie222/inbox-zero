import { SENDING_ACTION_TYPES } from "@/utils/ai/sending-action";
import prisma from "@/utils/prisma";

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
          executionStartedAt: { not: null },
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

  // A rule send on this thread is still in flight, so the message can't be
  // attributed yet. Treat it as rule-generated; if it was really the user's,
  // their next reply to the sender re-runs the exclusion.
  return candidates.some(({ executionStartedAt }) => executionStartedAt);
}
