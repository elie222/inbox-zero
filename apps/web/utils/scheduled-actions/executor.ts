/**
 * Executor service for scheduled actions
 * Handles execution, validation, and completion of delayed actions
 */

import type { gmail_v1 } from "@googleapis/gmail";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
} from "@prisma/client";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import { getMessage } from "@/utils/gmail/message";

const logger = createScopedLogger("scheduled-actions-executor");

// Maximum retry attempts for failed actions
const MAX_RETRY_ATTEMPTS = 3;

// Permanent errors that should not be retried
const PERMANENT_ERROR_CODES = [
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
];

/**
 * Execute a scheduled action
 */
export async function executeScheduledAction(scheduledAction: any) {
  const startTime = Date.now();

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

    const duration = Date.now() - startTime;
    logger.info("Successfully executed scheduled action", {
      scheduledActionId: scheduledAction.id,
      executedActionId: executedAction?.id,
      duration,
    });

    return { success: true, executedActionId: executedAction?.id };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Failed to execute scheduled action", {
      scheduledActionId: scheduledAction.id,
      error,
      duration,
    });

    // Determine if this is a permanent or temporary error
    const isPermanentError = isPermanentFailure(error);
    const shouldRetry =
      !isPermanentError && scheduledAction.retryCount < MAX_RETRY_ATTEMPTS;

    if (shouldRetry) {
      await scheduleRetry(scheduledAction.id, error);
      return { success: false, retry: true, error };
    } else {
      await markActionFailed(scheduledAction.id, error, isPermanentError);
      return { success: false, retry: false, error };
    }
  }
}

/**
 * Validate that the email still exists and return current state
 */
async function validateEmailState(
  gmail: gmail_v1.Gmail,
  scheduledAction: any,
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
    const parsedMessage = await import("@/utils/mail").then((m) =>
      m.parseMessage(message),
    );

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
  } catch (error: any) {
    if (error?.code === 404 || error?.message?.includes("not found")) {
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
  scheduledAction: any;
}) {
  // Create a temporary ExecutedRule and ExecutedAction for the executeAct function
  const tempExecutedAction = await prisma.executedAction.create({
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

  // Use existing executeAct function with temporary executed rule
  const tempExecutedRule = {
    id: scheduledAction.executedRuleId,
    actionItems: [tempExecutedAction],
  };

  await executeAct({
    gmail,
    userEmail: emailAccount.email,
    userId: emailAccount.userId,
    emailAccountId: emailAccount.id,
    executedRule: tempExecutedRule as any,
    message: emailMessage as any, // Cast to match expected type
  });

  return tempExecutedAction;
}

/**
 * Check if an error is permanent and should not be retried
 */
function isPermanentFailure(error: any): boolean {
  if (!error) return false;

  const errorCode = error.code || error.status;
  const errorMessage = error.message || "";

  // Check for specific error codes
  if (PERMANENT_ERROR_CODES.includes(errorCode)) {
    return true;
  }

  // Check for specific error messages
  if (
    errorMessage.includes("Permission denied") ||
    errorMessage.includes("Invalid argument") ||
    errorMessage.includes("Not found") ||
    errorMessage.includes("Forbidden") ||
    errorMessage.includes("Email account not found")
  ) {
    return true;
  }

  return false;
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
      errorMessage: reason || null,
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
async function markActionFailed(
  scheduledActionId: string,
  error: any,
  isPermanent: boolean,
) {
  const errorMessage = error?.message || String(error);

  await prisma.scheduledAction.update({
    where: { id: scheduledActionId },
    data: {
      status: ScheduledActionStatus.FAILED,
      errorMessage: `${isPermanent ? "[PERMANENT] " : ""}${errorMessage}`,
    },
  });

  logger.warn("Marked scheduled action as failed", {
    scheduledActionId,
    isPermanent,
    errorMessage,
  });
}

/**
 * Schedule a retry for a failed action
 */
async function scheduleRetry(scheduledActionId: string, error: any) {
  const retryDelay = 15 * 60 * 1000; // 15 minutes
  const retryAt = new Date(Date.now() + retryDelay);

  await prisma.scheduledAction.update({
    where: { id: scheduledActionId },
    data: {
      status: ScheduledActionStatus.PENDING,
      scheduledFor: retryAt,
      retryCount: { increment: 1 },
      errorMessage: `Retry scheduled: ${error?.message || String(error)}`,
    },
  });

  logger.info("Scheduled action retry", {
    scheduledActionId,
    retryAt,
    errorMessage: error?.message,
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
