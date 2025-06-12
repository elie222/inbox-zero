import type { gmail_v1 } from "@googleapis/gmail";
import { runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getGmailClientForEmail } from "@/utils/account";
import { getMessage } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { ActionType } from "@prisma/client";
import { updateExecutedActionWithDraftId } from "@/utils/ai/choose-rule/draft-management";

const logger = createScopedLogger("delayed-actions-scheduler");

/**
 * Processes all scheduled actions that are ready to be executed
 * This function should be called periodically by a cron job or scheduler
 */
export async function processDelayedActions() {
  logger.info("Starting delayed actions processing");

  try {
    // Find all scheduled actions that are ready to execute
    const readyActions = await prisma.executedAction.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          lte: new Date(),
        },
      },
      include: {
        executedRule: {
          include: {
            emailAccount: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
    });

    logger.info(`Found ${readyActions.length} actions ready for execution`);

    for (const action of readyActions) {
      await processDelayedAction(action);
    }

    logger.info("Completed delayed actions processing");
  } catch (error) {
    logger.error("Error processing delayed actions", { error });
    throw error;
  }
}

/**
 * Processes a single delayed action
 */
async function processDelayedAction(action: any) {
  const actionLogger = logger.with({
    actionId: action.id,
    actionType: action.type,
    executedRuleId: action.executedRuleId,
    emailAccountId: action.executedRule.emailAccount.id,
  });

  actionLogger.info("Processing delayed action");

  try {
    // Mark action as executing
    await prisma.executedAction.update({
      where: { id: action.id },
      data: { status: "EXECUTING" },
    });

    const emailAccount = action.executedRule.emailAccount;
    const gmail = await getGmailClientForEmail({
      emailAccountId: emailAccount.id,
    });

    // Get the original message to execute the action on
    const gmailMessage = await getMessage(
      action.executedRule.messageId,
      gmail,
      "full",
    );
    const message = parseMessage(gmailMessage);

    // Execute the action
    const actionResult = await runActionFunction({
      gmail,
      email: message,
      action: {
        id: action.id,
        type: action.type,
        label: action.label,
        subject: action.subject,
        content: action.content,
        to: action.to,
        cc: action.cc,
        bcc: action.bcc,
        url: action.url,
      },
      userEmail: emailAccount.email,
      userId: emailAccount.userId,
      emailAccountId: emailAccount.id,
      executedRule: action.executedRule,
    });

    // Handle draft creation result
    if (action.type === ActionType.DRAFT_EMAIL && actionResult?.draftId) {
      await updateExecutedActionWithDraftId({
        actionId: action.id,
        draftId: actionResult.draftId,
        logger: actionLogger,
      });
    }

    // Mark action as executed
    await prisma.executedAction.update({
      where: { id: action.id },
      data: { status: "EXECUTED" },
    });

    actionLogger.info("Successfully executed delayed action");
  } catch (error) {
    actionLogger.error("Failed to execute delayed action", { error });

    // Mark action as failed
    await prisma.executedAction.update({
      where: { id: action.id },
      data: { status: "FAILED" },
    });

    // Note: We don't mark the entire rule as failed for delayed actions
    // since other actions in the rule may have succeeded
  }
}

/**
 * Utility function to create delay times
 */
export const delayUtils = {
  minutes: (count: number) => count * 60 * 1000,
  hours: (count: number) => count * 60 * 60 * 1000,
  days: (count: number) => count * 24 * 60 * 60 * 1000,
  weeks: (count: number) => count * 7 * 24 * 60 * 60 * 1000,
  months: (count: number) => count * 30 * 24 * 60 * 60 * 1000, // Approximate
};

/**
 * Get count of scheduled actions by status
 */
export async function getDelayedActionsStats() {
  const stats = await prisma.executedAction.groupBy({
    by: ["status"],
    where: {
      status: {
        in: ["SCHEDULED", "EXECUTING", "EXECUTED", "FAILED"],
      },
    },
    _count: {
      status: true,
    },
  });

  return stats.reduce(
    (acc, stat) => {
      acc[stat.status] = stat._count.status;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * Cancel a scheduled action
 */
export async function cancelDelayedAction(actionId: string) {
  await prisma.executedAction.update({
    where: { id: actionId },
    data: { status: "CANCELLED" },
  });
}

/**
 * Reschedule an action to a new time
 */
export async function rescheduleAction(actionId: string, newScheduledAt: Date) {
  await prisma.executedAction.update({
    where: { id: actionId },
    data: {
      scheduledAt: newScheduledAt,
      status: "SCHEDULED",
    },
  });
}
