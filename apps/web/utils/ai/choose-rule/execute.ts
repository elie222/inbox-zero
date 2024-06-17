import { type gmail_v1 } from "googleapis";
import { EmailForAction, runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";
import { inboxZeroLabels } from "@/utils/label";
import { getOrCreateLabel, labelThread } from "@/utils/gmail/label";
import { ExecutedRuleStatus } from "@prisma/client";

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;
export async function executeAct({
  gmail,
  executedRule,
  userEmail,
  email,
}: {
  gmail: gmail_v1.Gmail;
  executedRule: ExecutedRuleWithActionItems;
  email: EmailForAction;
  userEmail: string;
}) {
  console.log("Executing act:", executedRule.id);

  async function labelActed() {
    const label = await getOrCreateLabel({
      gmail,
      name: inboxZeroLabels.acted,
    });

    if (!label.id) return;

    return labelThread({
      gmail,
      threadId: executedRule.threadId,
      addLabelIds: [label.id],
    });
  }

  await Promise.allSettled([
    ...executedRule.actionItems.map(async (action) => {
      return runActionFunction(gmail, email, action, userEmail);
    }),
    prisma.executedRule.update({
      where: { id: executedRule.id },
      data: { status: ExecutedRuleStatus.APPLIED },
    }),
    labelActed(),
  ]);
}
