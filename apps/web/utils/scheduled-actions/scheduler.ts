import { ScheduledActionStatus } from "@prisma/client";
import prisma from "@/utils/prisma";
import type { ActionItem } from "@/utils/ai/types";
import { createScopedLogger } from "@/utils/logger";
import { canActionBeDelayed } from "@/utils/delayed-actions";
import { env } from "@/env";
import { addMinutes } from "date-fns";
import { Client } from "@upstash/qstash";
import { enqueueJob } from "@/utils/queue/queue-manager";

const logger = createScopedLogger("qstash-scheduled-actions");

interface ScheduledActionPayload {
  scheduledActionId: string;
  [key: string]: unknown;
}

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

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

  if (actionItem.delayInMinutes == null || actionItem.delayInMinutes <= 0) {
    throw new Error(
      `Invalid delayInMinutes: ${actionItem.delayInMinutes}. Must be a positive number.`,
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
        folderName: actionItem.folderName,
        folderId: actionItem.folderId,
      },
    });

    const payload: ScheduledActionPayload = {
      scheduledActionId: scheduledAction.id,
    };

    const deduplicationId = `scheduled-action-${scheduledAction.id}`;

    const scheduledId = await scheduleMessage({
      payload,
      delayInMinutes: actionItem.delayInMinutes,
      deduplicationId,
    });

    if (scheduledId) {
      await prisma.scheduledAction.update({
        where: { id: scheduledAction.id },
        data: {
          scheduledId,
          schedulingStatus: "SCHEDULED" as const,
        },
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

  if (!delayedActions?.length) {
    return [];
  }

  const scheduledActions = [];

  for (const actionItem of delayedActions) {
    const scheduledFor = addMinutes(new Date(), actionItem.delayInMinutes!);

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

export async function cancelScheduledActions({
  emailAccountId,
  messageId,
  threadId,
  ruleId,
  reason = "Superseded by new rule",
}: {
  emailAccountId: string;
  messageId: string;
  threadId?: string;
  ruleId: string;
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
        executedRule: {
          ruleId,
        },
      },
      select: { id: true, scheduledId: true },
    });

    if (actionsToCancel.length === 0) {
      return 0;
    }

    // Cancel the QStash messages first for efficiency
    const client = getQstashClient();
    if (client) {
      for (const action of actionsToCancel) {
        if (action.scheduledId) {
          try {
            await cancelMessage(client, action.scheduledId);
            logger.info("Cancelled QStash message", {
              scheduledActionId: action.id,
              scheduledId: action.scheduledId,
            });
          } catch (error) {
            // Log but don't fail the entire operation if QStash cancellation fails
            logger.warn("Failed to cancel QStash message", {
              scheduledActionId: action.id,
              scheduledId: action.scheduledId,
              error,
            });
          }
        }
      }
    }

    const cancelledActions = await prisma.scheduledAction.updateMany({
      where: {
        emailAccountId,
        messageId,
        ...(threadId && { threadId }),
        status: ScheduledActionStatus.PENDING,
        executedRule: { ruleId },
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
      ruleId,
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

async function scheduleMessage({
  payload,
  delayInMinutes,
  deduplicationId,
}: {
  payload: ScheduledActionPayload;
  delayInMinutes: number;
  deduplicationId: string;
}) {
  try {
    // Use the unified queue system instead of direct QStash
    const delayInMs = delayInMinutes * 60 * 1000; // Convert minutes to milliseconds

    const job = await enqueueJob("scheduled-actions", payload, {
      delay: delayInMs,
      jobId: deduplicationId,
      attempts: 3,
    });

    const messageId = typeof job === "string" ? job : job.id;

    logger.info("Successfully scheduled with queue system", {
      scheduledActionId: payload.scheduledActionId,
      scheduledId: messageId,
      delayInMinutes,
      deduplicationId,
      queueSystem: env.QUEUE_SYSTEM,
    });

    return messageId;
  } catch (error) {
    logger.error("Failed to schedule with queue system", {
      error,
      scheduledActionId: payload.scheduledActionId,
      deduplicationId,
    });

    await prisma.scheduledAction.update({
      where: { id: payload.scheduledActionId },
      data: {
        schedulingStatus: "FAILED" as const,
      },
    });

    throw error;
  }
}

async function cancelMessage(
  client: InstanceType<typeof Client>,
  messageId: string,
) {
  try {
    // For QStash, we can still cancel directly
    if (env.QUEUE_SYSTEM === "upstash") {
      await client.http.request({
        path: ["v2", "messages", messageId],
        method: "DELETE",
      });
      logger.info("Successfully cancelled QStash message", { messageId });
    } else {
      // For Redis/BullMQ, we would need to implement job cancellation
      // For now, just log that cancellation is not supported
      logger.warn("Job cancellation not implemented for Redis queue system", {
        messageId,
      });
    }
  } catch (error) {
    logger.error("Failed to cancel message", { messageId, error });
    throw error;
  }
}

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
