import type { z } from "zod";
import { handleCallback } from "@vercel/queue";
import {
  executeAutomationJobBody,
  executeAutomationJobRun,
} from "@/utils/automation-jobs/execute";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { getQueueRetryBackoffSeconds } from "@/utils/queue/retry";

export const maxDuration = 300;

const logger = createScopedLogger("automation-jobs/execute/queue");

export const POST = handleCallback<z.infer<typeof executeAutomationJobBody>>(
  async (message, metadata) => {
    const parseResult = executeAutomationJobBody.safeParse(message);
    if (!parseResult.success) {
      logger.error("Invalid automation jobs queue payload", {
        errors: parseResult.error.issues,
        queueMessageId: metadata.messageId,
      });
      return;
    }

    const runLogger = logger.with({
      automationJobRunId: parseResult.data.automationJobRunId,
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
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
    retry: (_error, metadata) => ({
      afterSeconds: getQueueRetryBackoffSeconds({
        deliveryCount: metadata.deliveryCount,
      }),
    }),
  },
);
