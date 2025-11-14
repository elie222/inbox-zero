import {
  ExecutedRuleStatus,
  ScheduledActionStatus,
  type ScheduledAction,
} from "@prisma/client";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { runActionFunction } from "@/utils/ai/actions";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import type { EmailProvider } from "@/utils/email/types";

const MODULE = "scheduled-actions-executor";

/**
 * Execute a scheduled action
 */
export async function executeScheduledAction(
  scheduledAction: ScheduledAction,
  client: EmailProvider,
  logger: Logger,
) {
  const log = logger.with({
    module: MODULE,
    scheduledActionId: scheduledAction.id,
    actionType: scheduledAction.actionType,
    messageId: scheduledAction.messageId,
  });

  log.info("Executing scheduled action");

  try {
    const emailAccount = await getEmailAccountWithAiAndTokens({
      emailAccountId: scheduledAction.emailAccountId,
    });
    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    const emailMessage = await validateEmailState(client, scheduledAction, log);
    if (!emailMessage) {
      await markActionCompleted(
        scheduledAction.id,
        null,
        log,
        "Email no longer exists",
      );
      return { success: true, reason: "Email no longer exists" };
    }

    const actionItem: ActionItem = {
      id: scheduledAction.id, // Use scheduled action ID temporarily
      type: scheduledAction.actionType,
      label: scheduledAction.label,
      subject: scheduledAction.subject,
      content: scheduledAction.content,
      to: scheduledAction.to,
      cc: scheduledAction.cc,
      bcc: scheduledAction.bcc,
      url: scheduledAction.url,
    };

    const executedAction = await executeDelayedAction({
      client,
      actionItem,
      emailMessage,
      emailAccount: {
        email: emailAccount.email,
        userId: emailAccount.userId,
        id: emailAccount.id,
      },
      scheduledAction,
      log,
    });

    await markActionCompleted(scheduledAction.id, executedAction?.id, log);
    await checkAndCompleteExecutedRule(scheduledAction.executedRuleId, log);

    log.info("Successfully executed scheduled action", {
      scheduledActionId: scheduledAction.id,
      executedActionId: executedAction?.id,
    });

    return { success: true, executedActionId: executedAction?.id };
  } catch (error: unknown) {
    log.error("Failed to execute scheduled action", {
      scheduledActionId: scheduledAction.id,
      error,
    });

    await markActionFailed(scheduledAction.id, error, log);
    return { success: false, error };
  }
}

/**
 * Validate that the email still exists and return current state
 */
async function validateEmailState(
  client: EmailProvider,
  scheduledAction: ScheduledAction,
  log: Logger,
): Promise<EmailForAction | null> {
  try {
    const message = await client.getMessage(scheduledAction.messageId);

    if (!message) {
      log.info("Email no longer exists", {
        messageId: scheduledAction.messageId,
        scheduledActionId: scheduledAction.id,
      });
      return null;
    }

    const emailForAction: EmailForAction = {
      threadId: message.threadId,
      id: message.id,
      headers: message.headers,
      textPlain: message.textPlain || "",
      textHtml: message.textHtml || "",
      snippet: message.snippet || "",
      attachments: message.attachments || [],
      internalDate: message.internalDate,
    };

    return emailForAction;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Requested entity was not found."
    ) {
      log.info("Email not found during validation", {
        messageId: scheduledAction.messageId,
        scheduledActionId: scheduledAction.id,
      });
      return null;
    }

    throw error;
  }
}

/**
 * Execute the delayed action using existing action execution logic
 */
async function executeDelayedAction({
  client,
  actionItem,
  emailMessage,
  emailAccount,
  scheduledAction,
  log,
}: {
  client: EmailProvider;
  actionItem: ActionItem;
  emailMessage: EmailForAction;
  emailAccount: { email: string; userId: string; id: string };
  scheduledAction: ScheduledAction;
  log: Logger;
}) {
  const executedAction = await prisma.executedAction.create({
    data: {
      type: actionItem.type,
      label: actionItem.label,
      subject: actionItem.subject,
      content: actionItem.content,
      to: actionItem.to,
      cc: actionItem.cc,
      bcc: actionItem.bcc,
      url: actionItem.url,
      executedRule: {
        connect: { id: scheduledAction.executedRuleId },
      },
    },
  });

  const executedRule = await prisma.executedRule.findUnique({
    where: { id: scheduledAction.executedRuleId },
    include: { actionItems: true },
  });

  if (!executedRule) {
    throw new Error(`ExecutedRule ${scheduledAction.executedRuleId} not found`);
  }

  const email: EmailForAction = {
    id: emailMessage.id,
    threadId: emailMessage.threadId,
    headers: emailMessage.headers,
    textPlain: emailMessage.textPlain,
    textHtml: emailMessage.textHtml,
    snippet: emailMessage.snippet,
    attachments: emailMessage.attachments,
    internalDate: emailMessage.internalDate,
  };

  log.info("Executing delayed action", {
    actionType: executedAction.type,
    executedActionId: executedAction.id,
    messageId: email.id,
  });

  await runActionFunction({
    client,
    email,
    action: executedAction,
    userEmail: emailAccount.email,
    userId: emailAccount.userId,
    emailAccountId: emailAccount.id,
    executedRule,
    logger: log,
  });

  log.info("Successfully executed delayed action", {
    actionType: executedAction.type,
    executedActionId: executedAction.id,
  });

  return executedAction;
}

/**
 * Mark scheduled action as completed
 */
async function markActionCompleted(
  scheduledActionId: string,
  executedActionId: string | null | undefined,
  log: Logger,
  reason?: string,
) {
  await prisma.scheduledAction.update({
    where: { id: scheduledActionId },
    data: {
      status: ScheduledActionStatus.COMPLETED,
      executedAt: new Date(),
      executedActionId: executedActionId || undefined,
    },
  });

  log.info("Marked scheduled action as completed", {
    scheduledActionId,
    executedActionId,
    reason,
  });
}

/**
 * Mark scheduled action as failed
 */
async function markActionFailed(
  scheduledActionId: string,
  error: unknown,
  log: Logger,
) {
  await prisma.scheduledAction.update({
    where: { id: scheduledActionId },
    data: {
      status: ScheduledActionStatus.FAILED,
    },
  });

  log.warn("Marked scheduled action as failed", {
    scheduledActionId,
    error,
  });
}

/**
 * Check if all scheduled actions for an ExecutedRule are complete
 * and update the ExecutedRule status accordingly
 */
async function checkAndCompleteExecutedRule(
  executedRuleId: string,
  log: Logger,
) {
  const pendingActions = await prisma.scheduledAction.count({
    where: {
      executedRuleId,
      status: {
        in: [ScheduledActionStatus.PENDING, ScheduledActionStatus.EXECUTING],
      },
    },
  });

  if (pendingActions === 0) {
    await prisma.executedRule.update({
      where: { id: executedRuleId },
      data: { status: ExecutedRuleStatus.APPLIED },
    });

    log.info("Completed ExecutedRule - all scheduled actions finished", {
      executedRuleId,
    });
  }
}
