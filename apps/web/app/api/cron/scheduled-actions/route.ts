/**
 * Cron job for executing scheduled actions
 * Runs every 15 minutes to process due delayed actions
 */

import type { NextRequest } from "next/server";
import { withError } from "@/utils/middleware";
import { hasPostCronSecret } from "@/utils/cron";
import {
  getDueScheduledActions,
  markActionAsExecuting,
} from "@/utils/scheduled-actions/scheduler";
import { executeScheduledAction } from "@/utils/scheduled-actions/executor";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("cron-scheduled-actions");

export const maxDuration = 300; // 5 minutes

async function handler(request: NextRequest) {
  if (!hasPostCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Starting scheduled actions cron job");

  try {
    // Get due scheduled actions
    const dueActions = await getDueScheduledActions();

    if (dueActions.length === 0) {
      logger.info("No scheduled actions due for execution");
      return new Response("No actions due", { status: 200 });
    }

    logger.info("Processing scheduled actions", { count: dueActions.length });

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      retried: 0,
    };

    // Process each scheduled action
    for (const scheduledAction of dueActions) {
      try {
        results.processed++;

        // Mark as executing to prevent duplicate processing
        const markedAction = await markActionAsExecuting(scheduledAction.id);
        if (!markedAction) {
          logger.warn("Action already being processed or completed", {
            scheduledActionId: scheduledAction.id,
          });
          continue;
        }

        // Execute the action
        const executionResult = await executeScheduledAction(scheduledAction);

        if (executionResult.success) {
          results.successful++;
          logger.info("Successfully executed scheduled action", {
            scheduledActionId: scheduledAction.id,
            executedActionId: executionResult.executedActionId,
          });
        } else if (executionResult.retry) {
          results.retried++;
          logger.info("Scheduled action for retry", {
            scheduledActionId: scheduledAction.id,
            error: executionResult.error,
          });
        } else {
          results.failed++;
          logger.error("Permanently failed scheduled action", {
            scheduledActionId: scheduledAction.id,
            error: executionResult.error,
          });
        }
      } catch (error) {
        results.failed++;
        logger.error("Failed to process scheduled action", {
          scheduledActionId: scheduledAction.id,
          error,
        });
      }
    }

    logger.info("Completed scheduled actions cron job", results);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.error("Scheduled actions cron job failed", { error });
    return new Response("Internal server error", { status: 500 });
  }
}

export const POST = withError(handler);
