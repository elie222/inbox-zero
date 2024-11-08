import type { gmail_v1 } from "@googleapis/gmail";
import { type EmailForAction, runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
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
  console.log(
    `Executing act: ${executedRule.id} for rule ${executedRule.ruleId}`,
  );

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

  const pendingRules = await prisma.executedRule.updateMany({
    where: { id: executedRule.id, status: ExecutedRuleStatus.PENDING },
    data: { status: ExecutedRuleStatus.APPLYING },
  });

  if (pendingRules.count === 0) {
    console.log(`Rule ${executedRule.id} is not pending or does not exist`);
    return;
  }

  for (const action of executedRule.actionItems) {
    try {
      await runActionFunction(gmail, email, action, userEmail);
    } catch (error) {
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.ERROR },
      });
      throw error;
    }
  }

  await Promise.allSettled([
    await prisma.executedRule.update({
      where: { id: executedRule.id },
      data: { status: ExecutedRuleStatus.APPLIED },
    }),
    labelActed(),
  ]);
}
