import { ScheduledActionStatus } from "@prisma/client";
import prisma from "@/utils/prisma";
import type { ActionItem } from "@/utils/ai/types";
import { createScopedLogger } from "@/utils/logger";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import { env } from "@/env";
import { getCronSecretHeader } from "@/utils/cron";
import { Client } from "@upstash/qstash";
import { addMinutes, getUnixTime } from "date-fns";

const logger = createScopedLogger("qstash-scheduled-actions");

interface ScheduledActionPayload {
  scheduledActionId: string;
}

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

/**
 * Create a scheduled action and queue it with QStash
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
    // Create the scheduled action record first
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

    const payload: ScheduledActionPayload = {
      scheduledActionId: scheduledAction.id,
    };

    const deduplicationId = `scheduled-action-${scheduledAction.id}`;

    if (actionItem.delayInMinutes == null || actionItem.delayInMinutes <= 0) {
      throw new Error(
        `Invalid delayInMinutes: ${actionItem.delayInMinutes}. Must be a positive number.`,
      );
    }

    const qstashMessageId = await scheduleMessage({
      payload,
      delayInMinutes: actionItem.delayInMinutes,
      deduplicationId,
    });

    if (qstashMessageId) {
      await prisma.scheduledAction.update({
        where: { id: scheduledAction.id },
        data: { qstashMessageId },
      });
    }

    logger.info("Created and scheduled action with QStash", {
      scheduledActionId: scheduledAction.id,
      actionType: actionItem.type,
      scheduledFor,
      messageId,
      threadId,
      deduplicationId,
    });

    return scheduledAction;
  } catch (error) {
    logger.error("Failed to create QStash scheduled action", {
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
 * Schedule delayed actions using QStash for a set of action items
 */
export async function scheduleDelayedActions({
  executedRuleId,
  actionItems,
  messageId,
  threadId,
  emailAccountId,
}: {
  executedRuleId: string;
  actionItems: ActionItem[];
  messageId: string;
  threadId: string;
  emailAccountId: string;
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
    if (actionItem.delayInMinutes == null || actionItem.delayInMinutes <= 0) {
      logger.warn("Skipping action with invalid delayInMinutes", {
        actionType: actionItem.type,
        delayInMinutes: actionItem.delayInMinutes,
        executedRuleId,
        messageId,
      });
      continue;
    }

    const scheduledFor = addMinutes(new Date(), actionItem.delayInMinutes);

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

  logger.info("Scheduled delayed actions with QStash", {
    count: scheduledActions.length,
    executedRuleId,
    messageId,
    threadId,
  });

  return scheduledActions;
}

/**
 * Cancel existing scheduled actions and their QStash schedules
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
    // First, get the scheduled actions that will be cancelled
    const actionsToCancel = await prisma.scheduledAction.findMany({
      where: {
        emailAccountId,
        messageId,
        ...(threadId && { threadId }),
        status: ScheduledActionStatus.PENDING,
      },
      select: { id: true, qstashMessageId: true },
    });

    if (actionsToCancel.length === 0) {
      return 0;
    }

    // Cancel the QStash messages first for efficiency
    const client = getQstashClient();
    if (client) {
      for (const action of actionsToCancel) {
        if (action.qstashMessageId) {
          try {
            await cancelMessage(client, action.qstashMessageId);
            logger.info("Cancelled QStash message", {
              scheduledActionId: action.id,
              qstashMessageId: action.qstashMessageId,
            });
          } catch (error) {
            // Log but don't fail the entire operation if QStash cancellation fails
            logger.warn("Failed to cancel QStash message", {
              scheduledActionId: action.id,
              qstashMessageId: action.qstashMessageId,
              error,
            });
          }
        }
      }
    }

    // Cancel in database
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

    logger.info("Cancelled QStash scheduled actions", {
      count: cancelledActions.count,
      emailAccountId,
      messageId,
      threadId,
      reason,
    });

    return cancelledActions.count;
  } catch (error) {
    logger.error("Failed to cancel QStash scheduled actions", {
      error,
      emailAccountId,
      messageId,
      threadId,
    });
    throw error;
  }
}

/**
 * Schedule a message with QStash
 */
async function scheduleMessage({
  payload,
  delayInMinutes,
  deduplicationId,
}: {
  payload: ScheduledActionPayload;
  delayInMinutes: number;
  deduplicationId: string;
}) {
  const client = getQstashClient();
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/scheduled-actions/execute`;

  // Calculate the absolute timestamp when the action should execute using date-fns
  const notBefore = getUnixTime(addMinutes(new Date(), delayInMinutes));

  try {
    if (client) {
      const response = await client.publishJSON({
        url,
        body: payload,
        notBefore, // Absolute delay using unix timestamp
        deduplicationId,
        contentBasedDeduplication: false,
        headers: getCronSecretHeader(),
      });

      const messageId =
        "messageId" in response ? response.messageId : undefined;

      logger.info("Successfully scheduled with QStash", {
        scheduledActionId: payload.scheduledActionId,
        qstashMessageId: messageId,
        notBefore,
        delayInMinutes,
        deduplicationId,
      });

      return messageId;
    } else {
      // Fallback - just log and continue without scheduling
      logger.warn(
        "QStash client not available, scheduled action will not execute automatically",
        {
          scheduledActionId: payload.scheduledActionId,
        },
      );
      return null;
    }
  } catch (error) {
    logger.error("Failed to schedule with QStash", {
      error,
      scheduledActionId: payload.scheduledActionId,
      deduplicationId,
    });
    throw error;
  }
}

/**
 * Cancel a QStash message using the message ID
 */
async function cancelMessage(
  client: InstanceType<typeof Client>,
  messageId: string,
) {
  try {
    await client.http.request({
      path: ["v2", "messages", messageId],
      method: "DELETE",
    });
    logger.info("Successfully cancelled QStash message", { messageId });
  } catch (error) {
    logger.error("Failed to cancel QStash message", { messageId, error });
    throw error;
  }
}

/**
 * Mark scheduled action as executing to prevent duplicate execution
 * Returns null if action cannot be executed (already executing, cancelled, etc.)
 */
export async function markQStashActionAsExecuting(scheduledActionId: string) {
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
    // If update fails, the action might already be executing, completed, or cancelled
    logger.warn("Failed to mark QStash action as executing", {
      scheduledActionId,
      error,
    });
    return null;
  }
}
