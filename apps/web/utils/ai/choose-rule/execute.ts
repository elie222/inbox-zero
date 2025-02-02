import type { gmail_v1 } from "@googleapis/gmail";
import { type EmailForAction, runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { getOrCreateInboxZeroLabel, labelThread } from "@/utils/gmail/label";
import { ActionType, ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { markNeedsReply } from "@/utils/reply-tracker/inbound";

const logger = createScopedLogger("ai-execute-act");

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;
export async function executeAct({
  gmail,
  executedRule,
  userEmail,
  email,
  isReplyTrackingRule,
}: {
  gmail: gmail_v1.Gmail;
  executedRule: ExecutedRuleWithActionItems;
  email: EmailForAction;
  userEmail: string;
  isReplyTrackingRule: boolean;
}) {
  logger.info("Executing rule", {
    userEmail,
    executedRuleId: executedRule.id,
    ruleId: executedRule.ruleId,
    isReplyTrackingRule,
  });

  async function labelActed() {
    const label = await getOrCreateInboxZeroLabel({
      gmail,
      key: "acted",
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
    logger.info("Executed rule is not pending or does not exist", {
      userEmail,
      executedRuleId: executedRule.id,
    });
    return;
  }

  for (const action of executedRule.actionItems) {
    try {
      // we handle the reply tracking labelling below instead
      if (isReplyTrackingRule && action.type === ActionType.LABEL) continue;

      await runActionFunction(gmail, email, action, userEmail, executedRule);
    } catch (error) {
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.ERROR },
      });
      throw error;
    }
  }

  // reply tracker
  if (isReplyTrackingRule) {
    try {
      await markNeedsReply(
        executedRule.userId,
        executedRule.threadId,
        executedRule.messageId,
        gmail,
      );
    } catch (error) {
      logger.error("Failed to create reply tracker", {
        error,
        userId: executedRule.userId,
        email: userEmail,
        threadId: executedRule.threadId,
        messageId: executedRule.messageId,
      });
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
