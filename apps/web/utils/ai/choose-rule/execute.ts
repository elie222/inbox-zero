import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ExecutedRuleStatus, ActionType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { updateExecutedActionWithDraftId } from "@/utils/ai/choose-rule/draft-management";
import type { EmailProvider } from "@/utils/email/types";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";

const MODULE = "ai-execute-act";

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;

type ActionFailure = {
  type: ActionType;
  errorCode: string;
};

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

  const actionFailures: ActionFailure[] = [];

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

      const actionFailure = getActionFailure(action.type, actionResult);
      if (actionFailure) {
        actionFailures.push(actionFailure);
      }

      if (action.type === ActionType.DRAFT_EMAIL && actionResult?.draftId) {
        await updateExecutedActionWithDraftId({
          actionId: action.id,
          draftId: actionResult.draftId,
          logger,
        });
      }
    } catch (error) {
      await logErrorWithDedupe({
        logger: log,
        message: "Error executing action",
        error,
        dedupeKeyParts: {
          scope: "ai/choose-rule/execute",
          emailAccountId,
          actionType: action.type,
        },
      });
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.ERROR },
      });
      throw error;
    }
  }

  if (actionFailures.length > 0) {
    await prisma.executedRule
      .update({
        where: { id: executedRule.id },
        data: {
          status: ExecutedRuleStatus.ERROR,
          reason: buildFailureReason(executedRule.reason, actionFailures),
        },
      })
      .then(() => {
        log.warn(
          "ExecutedRule status updated to ERROR due to action failures",
          {
            actionFailures: actionFailures.map((failure) => ({
              type: failure.type,
              errorCode: failure.errorCode,
            })),
          },
        );
      })
      .catch((error) => {
        log.error("Failed to update executed rule", { error });
      });

    return;
  }

  await prisma.executedRule
    .update({
      where: { id: executedRule.id },
      data: { status: ExecutedRuleStatus.APPLIED },
    })
    .then(() => {
      log.info("ExecutedRule status updated to APPLIED", {
        executedRuleId: executedRule.id,
      });
    })
    .catch((error) => {
      log.error("Failed to update executed rule", { error });
    });
}

function getActionFailure(
  actionType: ActionType,
  actionResult: unknown,
): ActionFailure | null {
  if (actionType !== ActionType.NOTIFY_SENDER) return null;

  if (
    !actionResult ||
    typeof actionResult !== "object" ||
    !("success" in actionResult)
  ) {
    return null;
  }

  if (actionResult.success !== false) return null;

  if (!("errorCode" in actionResult)) {
    return { type: actionType, errorCode: "UNKNOWN_NOTIFY_FAILURE" };
  }

  return {
    type: actionType,
    errorCode:
      typeof actionResult.errorCode === "string"
        ? actionResult.errorCode
        : "UNKNOWN_NOTIFY_FAILURE",
  };
}

function buildFailureReason(
  existingReason: string | null,
  actionFailures: ActionFailure[],
): string {
  const failureSummary = actionFailures
    .map(({ type, errorCode }) => `${type}:${errorCode}`)
    .join(",");

  const failureReason = `Action failures: ${failureSummary}`;

  if (!existingReason) return failureReason;
  return `${existingReason}\n${failureReason}`;
}
