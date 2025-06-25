/**
 * Scheduler service for delayed actions
 * Handles creation, cancellation, and management of scheduled actions
 */

import { ActionType, ScheduledActionStatus } from "@prisma/client";
import prisma from "@/utils/prisma";
import type { ActionItem } from "@/utils/ai/types";
import { createScopedLogger } from "@/utils/logger";
import { canActionBeDelayed } from "@/utils/delayed-actions";

const logger = createScopedLogger("scheduled-actions");

/**
 * Create a scheduled action for delayed execution
 */
export async function createScheduledAction({
  executedRuleId,
  actionItem,
  messageId,
  threadId,
  emailAccountId,
  scheduledFor,
}: {
  executedRuleId: string;
  actionItem: ActionItem;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  scheduledFor: Date;
}) {
  if (!canActionBeDelayed(actionItem.type)) {
    throw new Error(
      `Action type ${actionItem.type} is not supported for delayed execution`,
    );
  }

  try {
    const scheduledAction = await prisma.scheduledAction.create({
      data: {
        executedRuleId,
        actionType: actionItem.type,
        messageId,
        threadId,
        emailAccountId,
        scheduledFor,
        status: ScheduledActionStatus.PENDING,
        // Store ActionItem data for later execution
        label: actionItem.label,
        subject: actionItem.subject,
        content: actionItem.content,
        to: actionItem.to,
        cc: actionItem.cc,
        bcc: actionItem.bcc,
        url: actionItem.url,
      },
    });

    logger.info("Created scheduled action", {
      scheduledActionId: scheduledAction.id,
      actionType: actionItem.type,
      scheduledFor,
      messageId,
      threadId,
    });

    return scheduledAction;
  } catch (error) {
    logger.error("Failed to create scheduled action", {
      error,
      executedRuleId,
      actionType: actionItem.type,
      messageId,
      threadId,
    });
    throw error;
  }
}

/**
 * Schedule delayed actions for a set of action items
 */
export async function scheduleDelayedActions({
  executedRuleId,
  actionItems,
  messageId,
  threadId,
  emailAccountId,
  emailInternalDate,
}: {
  executedRuleId: string;
  actionItems: ActionItem[];
  messageId: string;
  threadId: string;
  emailAccountId: string;
  emailInternalDate: Date;
}) {
  const delayedActions = actionItems.filter(
    (item) =>
      item.delayInMinutes != null &&
      item.delayInMinutes > 0 &&
      canActionBeDelayed(item.type),
  );

  if (delayedActions.length === 0) {
    return [];
  }

  const scheduledActions = [];

  for (const actionItem of delayedActions) {
    const scheduledFor = new Date(
      emailInternalDate.getTime() + actionItem.delayInMinutes! * 60 * 1000,
    );

    const scheduledAction = await createScheduledAction({
      executedRuleId,
      actionItem,
      messageId,
      threadId,
      emailAccountId,
      scheduledFor,
    });

    scheduledActions.push(scheduledAction);
  }

  logger.info("Scheduled delayed actions", {
    count: scheduledActions.length,
    executedRuleId,
    messageId,
    threadId,
  });

  return scheduledActions;
}

/**
 * Cancel existing scheduled actions for a message
 * Used when new rules override previous scheduled actions
 */
export async function cancelScheduledActions({
  emailAccountId,
  messageId,
  threadId,
  reason = "Superseded by new rule",
}: {
  emailAccountId: string;
  messageId: string;
  threadId?: string;
  reason?: string;
}) {
  try {
    const cancelledActions = await prisma.scheduledAction.updateMany({
      where: {
        emailAccountId,
        messageId,
        ...(threadId && { threadId }),
        status: ScheduledActionStatus.PENDING,
      },
      data: {
        status: ScheduledActionStatus.CANCELLED,
      },
    });

    if (cancelledActions.count > 0) {
      logger.info("Cancelled scheduled actions", {
        count: cancelledActions.count,
        emailAccountId,
        messageId,
        threadId,
        reason,
      });
    }

    return cancelledActions.count;
  } catch (error) {
    logger.error("Failed to cancel scheduled actions", {
      error,
      emailAccountId,
      messageId,
      threadId,
    });
    throw error;
  }
}

/**
 * Get due scheduled actions for cron job execution
 */
export async function getDueScheduledActions(limit = 100) {
  try {
    const dueActions = await prisma.scheduledAction.findMany({
      where: {
        status: ScheduledActionStatus.PENDING,
        scheduledFor: {
          lte: new Date(),
        },
      },
      include: {
        emailAccount: true,
        executedRule: true,
      },
      orderBy: {
        scheduledFor: "asc",
      },
      take: limit,
    });

    logger.trace("Found due scheduled actions", {
      count: dueActions.length,
    });

    return dueActions;
  } catch (error) {
    logger.error("Failed to get due scheduled actions", { error });
    throw error;
  }
}

/**
 * Mark scheduled action as executing to prevent duplicate execution
 */
export async function markActionAsExecuting(scheduledActionId: string) {
  try {
    const updatedAction = await prisma.scheduledAction.update({
      where: {
        id: scheduledActionId,
        status: ScheduledActionStatus.PENDING,
      },
      data: {
        status: ScheduledActionStatus.EXECUTING,
      },
    });

    return updatedAction;
  } catch (error) {
    // If update fails, the action might already be executing or completed
    logger.warn("Failed to mark action as executing", {
      scheduledActionId,
      error,
    });
    return null;
  }
}
