import {
  ExecutedRuleStatus,
  ScheduledActionStatus,
  type ScheduledAction,
} from "@prisma/client";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { runActionFunction } from "@/utils/ai/actions";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("scheduled-actions-executor");

/**
 * Execute a scheduled action
 */
export async function executeScheduledAction(
  scheduledAction: ScheduledAction,
  client: EmailProvider,
) {
  logger.info("Executing scheduled action", {
    scheduledActionId: scheduledAction.id,
    actionType: scheduledAction.actionType,
    messageId: scheduledAction.messageId,
    emailAccountId: scheduledAction.emailAccountId,
  });

  try {
    const emailAccount = await getEmailAccountWithAiAndTokens({
      emailAccountId: scheduledAction.emailAccountId,
    });
    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    const emailMessage = await validateEmailState(client, scheduledAction);
    if (!emailMessage) {
      await markActionCompleted(
        scheduledAction.id,
        null,
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
    });

    await markActionCompleted(scheduledAction.id, executedAction?.id);
    await checkAndCompleteExecutedRule(scheduledAction.executedRuleId);

    logger.info("Successfully executed scheduled action", {
      scheduledActionId: scheduledAction.id,
      executedActionId: executedAction?.id,
    });

    return { success: true, executedActionId: executedAction?.id };
  } catch (error: unknown) {
    logger.error("Failed to execute scheduled action", {
      scheduledActionId: scheduledAction.id,
      error,
    });

    await markActionFailed(scheduledAction.id, error);
    return { success: false, error };
  }
}

/**
 * Validate that the email still exists and return current state
 */
async function validateEmailState(
  client: EmailProvider,
  scheduledAction: ScheduledAction,
): Promise<EmailForAction | null> {
  try {
    const message = await client.getMessage(scheduledAction.messageId);

    if (!message) {
      logger.info("Email no longer exists", {
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
      attachments: message.attachments || [],
      internalDate: message.internalDate,
    };

    return emailForAction;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Requested entity was not found."
    ) {
      logger.info("Email not found during validation", {
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
}: {
  client: EmailProvider;
  actionItem: ActionItem;
  emailMessage: EmailForAction;
  emailAccount: { email: string; userId: string; id: string };
  scheduledAction: ScheduledAction;
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
    attachments: emailMessage.attachments,
    internalDate: emailMessage.internalDate,
  };

  logger.info("Executing delayed action", {
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
  });

  logger.info("Successfully executed delayed action", {
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

  logger.info("Marked scheduled action as completed", {
    scheduledActionId,
    executedActionId,
    reason,
  });
}

/**
 * Mark scheduled action as failed
 */
async function markActionFailed(scheduledActionId: string, error: unknown) {
  await prisma.scheduledAction.update({
    where: { id: scheduledActionId },
    data: {
      status: ScheduledActionStatus.FAILED,
    },
  });

  logger.warn("Marked scheduled action as failed", {
    scheduledActionId,
    error,
  });
}

/**
 * Check if all scheduled actions for an ExecutedRule are complete
 * and update the ExecutedRule status accordingly
 */
async function checkAndCompleteExecutedRule(executedRuleId: string) {
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

    logger.info("Completed ExecutedRule - all scheduled actions finished", {
      executedRuleId,
    });
  }
}
