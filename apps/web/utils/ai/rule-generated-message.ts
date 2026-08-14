import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

const SENDING_ACTION_TYPES = [
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
];

export async function isRuleGeneratedMessage({
  emailAccountId,
  threadId,
  messageId,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
}) {
  const executedAction = await prisma.executedAction.findFirst({
    where: {
      type: { in: SENDING_ACTION_TYPES },
      executedRule: { emailAccountId, threadId },
      OR: [
        { sentMessageIds: { has: messageId } },
        {
          executionStatus: null,
          OR: [
            { executedRule: { status: ExecutedRuleStatus.APPLYING } },
            {
              scheduledAction: {
                status: ScheduledActionStatus.EXECUTING,
              },
            },
          ],
        },
      ],
    },
    select: { id: true },
  });

  return !!executedAction;
}
