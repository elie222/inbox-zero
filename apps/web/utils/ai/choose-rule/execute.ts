import { type gmail_v1 } from "googleapis";
import { EmailForAction, runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";
import { getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelThread } from "@/utils/gmail/label";
import { ExecutedRuleStatus } from "@prisma/client";

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;
export async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  executedRule: ExecutedRuleWithActionItems;
  email: EmailForAction;
  userEmail: string;
}) {
  const { gmail, executedRule, userEmail, email } = options;

  console.log("Executing act:", executedRule.id);

  async function labelActed() {
    const label = await getOrCreateInboxZeroLabel({
      gmail,
      email: userEmail,
      labelKey: "acted",
    });

    if (!label) return;

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
