import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { ExecutedRuleStatus, ActionType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { updateExecutedActionWithDraftId } from "@/utils/ai/choose-rule/draft-management";
import type { EmailProvider } from "@/utils/email/types";

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;

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
