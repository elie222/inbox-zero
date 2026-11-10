import {
  ActionType,
  ExecutedActionStatus,
  ExecutedRuleStatus,
  ScheduledActionStatus,
} from "@/generated/prisma/enums";
import type { ExecutedAction } from "@/generated/prisma/client";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import type { ActionExecutionEmailAccount } from "@/utils/ai/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";

// Repeating these leaves the mailbox the same as running them once. Anything
// that sends, notifies or calls out (sends, replies, forwards, messaging,
// webhooks, integrations, digests) could do its effect twice, so it never
// runs again on a retry.
const ACTIONS_SAFE_TO_REPEAT = new Set<ActionType>([
  ActionType.ARCHIVE,
  ActionType.LABEL,
  ActionType.MARK_READ,
  ActionType.MOVE_FOLDER,
  ActionType.STAR,
  ActionType.MARK_SPAM,
  ActionType.DELETE,
]);

// A rule's actions can stop partway, typically on a provider rate limit,
// leaving the saved result in ERROR. Finishing the actions that failed or never
// started lets a retry complete the email instead of skipping it.
export async function retryFailedRuleActions({
  client,
  executedRuleId,
  message,
  emailAccount,
  skipDraftReplies,
  logger,
}: {
  client: EmailProvider;
  executedRuleId: string;
  message: ParsedMessage;
  emailAccount: ActionExecutionEmailAccount;
  skipDraftReplies?: boolean;
  logger: Logger;
}): Promise<ExecutedRuleStatus | null> {
  const log = logger.with({ executedRuleId });

  const executedRule = await prisma.executedRule.findUnique({
    where: { id: executedRuleId },
    include: { actionItems: true },
  });
  if (!executedRule) return null;
  if (executedRule.status !== ExecutedRuleStatus.ERROR) {
    return executedRule.status;
  }

  const unfinishedActions = executedRule.actionItems.filter(
    (action) =>
      action.executionStatus === null ||
      action.executionStatus === ExecutedActionStatus.FAILED,
  );

  const actionsToRetry: ExecutedAction[] = [];
  for (const action of unfinishedActions) {
    if (ACTIONS_SAFE_TO_REPEAT.has(action.type)) {
      actionsToRetry.push(action);
    } else if (
      action.type === ActionType.DRAFT_EMAIL &&
      !skipDraftReplies &&
      !(await hasDraftFromRuleInThread(executedRule))
    ) {
      actionsToRetry.push(action);
    }
  }

  if (actionsToRetry.length === 0) {
    log.info("No failed rule actions are safe to retry");
    return executedRule.status;
  }

  // Claiming the result keeps concurrent retries from repeating actions, such
  // as both creating a draft.
  const claim = await prisma.executedRule.updateMany({
    where: { id: executedRule.id, status: ExecutedRuleStatus.ERROR },
    data: { status: ExecutedRuleStatus.APPLYING },
  });
  if (claim.count === 0) {
    log.info("Another run is already retrying these rule actions");
    return null;
  }

  log.info("Retrying failed rule actions", {
    actionTypes: actionsToRetry.map((action) => action.type),
  });

  const status = await executeAct({
    client,
    executedRule: { ...executedRule, actionItems: actionsToRetry },
    message,
    emailAccount,
    logger: log,
  });

  if (
    status === ExecutedRuleStatus.APPLIED &&
    (unfinishedActions.length > actionsToRetry.length ||
      (await hasFailedScheduledAction(executedRule.id)))
  ) {
    await prisma.executedRule.update({
      where: { id: executedRule.id },
      data: { status: ExecutedRuleStatus.ERROR },
    });
    return ExecutedRuleStatus.ERROR;
  }

  return status;
}

async function hasFailedScheduledAction(executedRuleId: string) {
  const failedCount = await prisma.scheduledAction.count({
    where: { executedRuleId, status: ScheduledActionStatus.FAILED },
  });
  return failedCount > 0;
}

async function hasDraftFromRuleInThread({
  emailAccountId,
  threadId,
  ruleId,
}: {
  emailAccountId: string;
  threadId: string;
  ruleId: string | null;
}) {
  // Without a rule to match on, a draft can't be ruled out, so assume one exists.
  if (!ruleId) return true;

  const draft = await prisma.executedAction.findFirst({
    where: {
      type: ActionType.DRAFT_EMAIL,
      draftId: { not: null },
      executedRule: { emailAccountId, threadId, ruleId },
    },
    select: { id: true },
  });

  return Boolean(draft);
}
