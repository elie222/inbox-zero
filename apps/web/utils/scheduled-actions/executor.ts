import type { gmail_v1 } from "@googleapis/gmail";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
  type ScheduledAction,
} from "@prisma/client";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import type { ParsedMessage } from "@/utils/types";
import { getMessage } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { formatError } from "@/utils/error";

const logger = createScopedLogger("scheduled-actions-executor");

/**
 * Execute a scheduled action
 */
export async function executeScheduledAction(scheduledAction: ScheduledAction) {
  logger.info("Executing scheduled action", {
    scheduledActionId: scheduledAction.id,
    actionType: scheduledAction.actionType,
    messageId: scheduledAction.messageId,
    emailAccountId: scheduledAction.emailAccountId,
  });

  try {
    // Get email account with tokens
    const emailAccount = await getEmailAccountWithAiAndTokens({
      emailAccountId: scheduledAction.emailAccountId,
    });
    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    // Get Gmail client
    const gmail = await getGmailClientWithRefresh({
      accessToken: emailAccount.tokens.access_token,
      refreshToken: emailAccount.tokens.refresh_token,
      expiresAt: emailAccount.tokens.expires_at,
      emailAccountId: emailAccount.id,
    });

    // Validate email still exists and get current state
    const emailMessage = await validateEmailState(gmail, scheduledAction);
    if (!emailMessage) {
      await markActionCompleted(
        scheduledAction.id,
        null,
        "Email no longer exists",
      );
      return { success: true, reason: "Email no longer exists" };
    }

    // Create ActionItem from scheduled action data
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

    // Execute the action
    const executedAction = await executeDelayedAction({
      gmail,
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

    // Check if all scheduled actions for this ExecutedRule are complete
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
  gmail: gmail_v1.Gmail,
  scheduledAction: ScheduledAction,
): Promise<EmailForAction | null> {
  try {
    const message = await getMessage(scheduledAction.messageId, gmail, "full");

    if (!message) {
      logger.info("Email no longer exists", {
        messageId: scheduledAction.messageId,
        scheduledActionId: scheduledAction.id,
      });
      return null;
    }

    // Parse the message to get the correct format
    const parsedMessage = parseMessage(message);

    // Convert to EmailForAction format
    const emailForAction: EmailForAction = {
      threadId: parsedMessage.threadId,
      id: parsedMessage.id,
      headers: parsedMessage.headers,
      textPlain: parsedMessage.textPlain || "",
      textHtml: parsedMessage.textHtml || "",
      attachments: parsedMessage.attachments || [],
      internalDate: parsedMessage.internalDate,
    };

    return emailForAction;
  } catch (error: unknown) {
    // Check for Gmail's standard "not found" error message
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
  gmail,
  actionItem,
  emailMessage,
  emailAccount,
  scheduledAction,
}: {
  gmail: gmail_v1.Gmail;
  actionItem: ActionItem;
  emailMessage: EmailForAction;
  emailAccount: { email: string; userId: string; id: string };
  scheduledAction: ScheduledAction;
}) {
  // Create ExecutedAction record to integrate with existing executeAct function.
  // This allows us to reuse the existing action execution logic for delayed actions
  // while maintaining proper audit trail and database consistency.
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

  // Get the complete ExecutedRule to satisfy the type requirements
  const executedRule = await prisma.executedRule.findUnique({
    where: { id: scheduledAction.executedRuleId },
    include: { actionItems: true },
  });

  if (!executedRule) {
    throw new Error(`ExecutedRule ${scheduledAction.executedRuleId} not found`);
  }

  // Create a ParsedMessage from EmailForAction to match executeAct signature
  const parsedMessage: ParsedMessage = {
    id: emailMessage.id,
    threadId: emailMessage.threadId,
    headers: emailMessage.headers,
    textPlain: emailMessage.textPlain,
    textHtml: emailMessage.textHtml,
    attachments: emailMessage.attachments,
    internalDate: emailMessage.internalDate,
    // Required ParsedMessage fields that aren't used in action execution
    snippet: "",
    historyId: "",
    inline: [],
  };

  await executeAct({
    gmail,
    userEmail: emailAccount.email,
    userId: emailAccount.userId,
    emailAccountId: emailAccount.id,
    executedRule,
    message: parsedMessage,
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
    // All scheduled actions are complete, update ExecutedRule status
    await prisma.executedRule.update({
      where: { id: executedRuleId },
      data: { status: ExecutedRuleStatus.APPLIED },
    });

    logger.info("Completed ExecutedRule - all scheduled actions finished", {
      executedRuleId,
    });
  }
}
