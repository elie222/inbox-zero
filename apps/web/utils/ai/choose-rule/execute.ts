import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { ExecutedRuleStatus, ActionType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { updateExecutedActionWithDraftId } from "@/utils/ai/choose-rule/draft-management";
import { EmailProvider } from "@/utils/email/provider";

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
  client,
  executedRule,
  userEmail,
  userId,
  emailAccountId,
  message,
}: {
  client: EmailProvider;
  executedRule: ExecutedRuleWithActionItems;
  message: ParsedMessage;
  userEmail: string;
  userId: string;
  emailAccountId: string;
}) {
  const logger = createScopedLogger("ai-execute-act").with({
    email: userEmail,
    executedRuleId: executedRule.id,
    ruleId: executedRule.ruleId,
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
      const actionResult = await runActionFunction({
        client,
        email: message,
        action,
        userEmail,
        userId,
        emailAccountId,
        executedRule,
      });

      if (action.type === ActionType.DRAFT_EMAIL && actionResult?.draftId) {
        await updateExecutedActionWithDraftId({
          actionId: action.id,
          draftId: actionResult.draftId,
          logger,
        });
      }
    } catch (error) {
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.ERROR },
      });
      throw error;
    }
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
