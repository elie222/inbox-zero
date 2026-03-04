import { handleCallback } from "@vercel/queue";
import {
  executeAutomationJobBody,
  type ExecuteAutomationJobBody,
} from "@/utils/actions/automation-jobs.validation";
import { executeAutomationJobRun } from "@/utils/automation-jobs/execute";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { getQueueRetryBackoffSeconds } from "@/utils/queue/retry";

export const maxDuration = 300;

export const POST = handleCallback<ExecuteAutomationJobBody>(
  async (message, metadata) => {
    const logger = createScopedLogger("automation-jobs/execute/queue").with({
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    });

    const parseResult = executeAutomationJobBody.safeParse(message);
    if (!parseResult.success) {
      logger.error("Invalid automation jobs queue payload", {
        errors: parseResult.error.errors,
      });
      return;
    }

    const runLogger = logger.with({
      automationJobRunId: parseResult.data.automationJobRunId,
    });

    try {
      const response = await executeAutomationJobRun({
        automationJobRunId: parseResult.data.automationJobRunId,
        logger: runLogger,
      });

      if (response.status >= 500) {
        throw new Error(
          `Automation job queue execution failed with status ${response.status}`,
        );
      }
    } catch (error) {
      runLogger.error("Failed queued automation job run", { error });
      captureException(error);
      throw error;
    }
  },
  {
    visibilityTimeoutSeconds: 330,
    retry: (_error, metadata) => {
      return {
        afterSeconds: getQueueRetryBackoffSeconds({
          deliveryCount: metadata.deliveryCount,
        }),
      };
    },
  },
);
