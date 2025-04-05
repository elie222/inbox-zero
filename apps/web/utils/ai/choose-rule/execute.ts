import type { gmail_v1 } from "@googleapis/gmail";
import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { coordinateReplyProcess } from "@/utils/reply-tracker/inbound";
import { internalDateToDate } from "@/utils/date";
import type { ParsedMessage } from "@/utils/types";

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;

/**
 * Executes actions for a rule that has been applied to an email message.
 * This function:
 * 1. Updates the executed rule status from PENDING to APPLYING
 * 2. Processes each action item associated with the rule
 * 3. Handles reply tracking if this is a reply tracking rule
 * 4. Updates the rule status to APPLIED when complete
 */
export async function executeAct({
  gmail,
  executedRule,
  userEmail,
  message,
  isReplyTrackingRule,
}: {
  gmail: gmail_v1.Gmail;
  executedRule: ExecutedRuleWithActionItems;
  message: ParsedMessage;
  userEmail: string;
  isReplyTrackingRule: boolean;
}) {
  const logger = createScopedLogger("ai-execute-act").with({
    email: userEmail,
    executedRuleId: executedRule.id,
    ruleId: executedRule.ruleId,
    isReplyTrackingRule,
    threadId: executedRule.threadId,
    messageId: executedRule.messageId,
  });

  const pendingRules = await prisma.executedRule.updateMany({
    where: { id: executedRule.id, status: ExecutedRuleStatus.PENDING },
    data: { status: ExecutedRuleStatus.APPLYING },
  });

  if (pendingRules.count === 0) {
    logger.info("Executed rule is not pending or does not exist");
    return;
  }

  for (const action of executedRule.actionItems) {
    try {
      await runActionFunction(gmail, message, action, userEmail, executedRule);
    } catch (error) {
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.ERROR },
      });
      throw error;
    }
  }

  // reply tracker
  // TODO: we should make this an action instead to keep it really clean
  if (isReplyTrackingRule) {
    await coordinateReplyProcess(
      executedRule.userId,
      userEmail,
      executedRule.threadId,
      executedRule.messageId,
      internalDateToDate(message.internalDate),
      gmail,
    ).catch((error) => {
      logger.error("Failed to create reply tracker", { error });
    });
  }

  await prisma.executedRule
    .update({
      where: { id: executedRule.id },
      data: { status: ExecutedRuleStatus.APPLIED },
    })
    .catch((error) => {
      logger.error("Failed to update executed rule", { error });
    });
}
