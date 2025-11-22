import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { ExecutedRuleStatus, ActionType } from "@prisma/client";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { updateExecutedActionWithDraftId } from "@/utils/ai/choose-rule/draft-management";
import type { EmailProvider } from "@/utils/email/types";

const MODULE = "ai-execute-act";

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
  logger,
}: {
  client: EmailProvider;
  executedRule: ExecutedRuleWithActionItems;
  message: ParsedMessage;
  userEmail: string;
  userId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const log = logger.with({
    module: MODULE,
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
        logger: log,
      });

      if (action.type === ActionType.DRAFT_EMAIL && actionResult?.draftId) {
        await updateExecutedActionWithDraftId({
          actionId: action.id,
          draftId: actionResult.draftId,
          logger,
        });
      }
    } catch (error) {
      log.error("Error executing action", { error });
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
      log.error("Failed to update executed rule", { error });
    });
}
