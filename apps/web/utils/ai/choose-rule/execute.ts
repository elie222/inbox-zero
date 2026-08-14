import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  ActionType,
  ExecutedActionStatus,
  ExecutedRuleStatus,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { updateExecutedActionWithDraftId } from "@/utils/ai/choose-rule/draft-management";
import type { EmailProvider } from "@/utils/email/types";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import type { ActionExecutionEmailAccount } from "@/utils/ai/types";
import { shouldSkipAutomatedArchiveForSender } from "@/utils/ai/automated-archive-exception";
import { flushLoggerSafely } from "@/utils/logger-flush";
import {
  getActionResultError,
  getSentMessageIds,
  isActionResultSkipped,
  normalizeActionExecutionError,
  persistExecutedActionOutcome,
} from "@/utils/ai/executed-action-outcome";

const MODULE = "ai-execute-act";

type ExecutedRuleWithActionItems = Prisma.ExecutedRuleGetPayload<{
  include: { actionItems: true };
}>;

type ActionFailure = {
  type: ActionType;
  errorCode: string;
  errorMessage: string;
};

export async function executeAct({
  client,
  executedRule,
  emailAccount,
  message,
  logger,
}: {
  client: EmailProvider;
  executedRule: ExecutedRuleWithActionItems;
  message: ParsedMessage;
  emailAccount: ActionExecutionEmailAccount;
  logger: Logger;
}): Promise<ExecutedRuleStatus> {
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
      if (
        shouldSkipAutomatedArchiveForSender({
          actionType: action.type,
          from: message.headers.from,
        })
      ) {
        log.info("Skipping automated archive for protected company sender", {
          actionId: action.id,
        });
        await persistExecutedActionOutcome({
          actionId: action.id,
          status: ExecutedActionStatus.SKIPPED,
          error: null,
          logger: log,
        });
        continue;
      }

      const actionResult = await runActionFunction({
        client,
        email: message,
        action,
        emailAccount,
        executedRule,
        logger: log,
      });

      if (isActionResultSkipped(actionResult)) {
        await persistExecutedActionOutcome({
          actionId: action.id,
          status: ExecutedActionStatus.SKIPPED,
          error: null,
          logger: log,
        });
        continue;
      }

      const actionResultError = getActionResultError(action.type, actionResult);
      if (actionResultError) {
        actionFailures.push({
          type: action.type,
          errorCode: actionResultError.code,
          errorMessage: actionResultError.message,
        });
        await persistExecutedActionOutcome({
          actionId: action.id,
          status: ExecutedActionStatus.FAILED,
          error: actionResultError,
          logger: log,
        });
      } else {
        await persistExecutedActionOutcome({
          actionId: action.id,
          status: ExecutedActionStatus.SUCCEEDED,
          error: null,
          sentMessageIds: getSentMessageIds(actionResult),
          logger: log,
        });
      }

      const draftId =
        action.type === ActionType.DRAFT_EMAIL
          ? getDraftId(actionResult)
          : null;

      if (draftId) {
        await updateExecutedActionWithDraftId({
          actionId: action.id,
          draftId,
          logger,
        });
      } else if (action.type === ActionType.DRAFT_EMAIL) {
        log.warn("Draft action completed without a draft ID", {
          actionId: action.id,
        });
      }
    } catch (error) {
      await persistExecutedActionOutcome({
        actionId: action.id,
        status: ExecutedActionStatus.FAILED,
        error: normalizeActionExecutionError(error),
        logger: log,
      });
      await logErrorWithDedupe({
        logger: log,
        message: "Error executing action",
        error,
        dedupeKeyParts: {
          scope: "ai/choose-rule/execute",
          emailAccountId: emailAccount.id,
          actionType: action.type,
        },
      });
      await flushLoggerSafely(log, {
        action: "executeAct",
        flushReason: "action-error",
        executedRuleId: executedRule.id,
        actionType: action.type,
      });
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.ERROR },
      });
      throw error;
    }
  }

  if (actionFailures.length > 0) {
    await updateExecutedRuleOrThrow({
      log,
      executedRuleId: executedRule.id,
      data: {
        status: ExecutedRuleStatus.ERROR,
        reason: buildFailureReason(executedRule.reason, actionFailures),
      },
    });
    log.warn("ExecutedRule status updated to ERROR due to action failures", {
      actionFailures: actionFailures.map((failure) => ({
        type: failure.type,
        errorCode: failure.errorCode,
      })),
    });
    return ExecutedRuleStatus.ERROR;
  }

  await updateExecutedRuleOrThrow({
    log,
    executedRuleId: executedRule.id,
    data: { status: ExecutedRuleStatus.APPLIED },
  });
  log.info("ExecutedRule status updated to APPLIED", {
    executedRuleId: executedRule.id,
  });
  return ExecutedRuleStatus.APPLIED;
}

async function updateExecutedRuleOrThrow({
  log,
  executedRuleId,
  data,
}: {
  log: Logger;
  executedRuleId: string;
  data: Prisma.ExecutedRuleUpdateInput;
}) {
  try {
    await prisma.executedRule.update({
      where: { id: executedRuleId },
      data,
    });
  } catch (error) {
    log.error("Failed to update executed rule", { error });
    throw error;
  }
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

function getDraftId(actionResult: unknown): string | null {
  if (
    !actionResult ||
    typeof actionResult !== "object" ||
    !("draftId" in actionResult) ||
    typeof actionResult.draftId !== "string"
  ) {
    return null;
  }

  return actionResult.draftId;
}
