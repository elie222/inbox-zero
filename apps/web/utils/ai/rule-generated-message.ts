import { SENDING_ACTION_TYPES } from "@/utils/ai/sending-action";
import prisma from "@/utils/prisma";

export class PendingMessageAttributionError extends Error {
  constructor() {
    super("Message attribution is still pending");
    this.name = "PendingMessageAttributionError";
  }
}

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

  if (candidates.some(({ executionStartedAt }) => executionStartedAt)) {
    throw new PendingMessageAttributionError();
  }

  return false;
}
