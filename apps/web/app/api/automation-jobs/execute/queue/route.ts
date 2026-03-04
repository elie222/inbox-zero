import type { z } from "zod";
import { handleCallback } from "@vercel/queue";
import {
  executeAutomationJobBody,
  executeAutomationJobRun,
} from "@/utils/automation-jobs/execute";
import { createScopedLogger } from "@/utils/logger";
import { getQueueRetryBackoffSeconds } from "@/utils/queue/retry";

export const maxDuration = 300;

const logger = createScopedLogger("automation-jobs/execute/queue");

export const POST = handleCallback<z.infer<typeof executeAutomationJobBody>>(
  async (message, metadata) => {
    const parseResult = executeAutomationJobBody.safeParse(message);
    if (!parseResult.success) {
      logger.error("Invalid automation jobs queue payload", {
        errors: parseResult.error.errors,
        queueMessageId: metadata.messageId,
      });
      return;
    }

    const runLogger = logger.with({
      automationJobRunId: parseResult.data.automationJobRunId,
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    });

    const response = await executeAutomationJobRun({
      automationJobRunId: parseResult.data.automationJobRunId,
      logger: runLogger,
    });

    if (response.status >= 500) {
      throw new Error(
        `Automation job queue execution failed with status ${response.status}`,
      );
    }
  },
  {
    visibilityTimeoutSeconds: 290,
    retry: (_error, metadata) => {
      return {
        afterSeconds: getQueueRetryBackoffSeconds({
          deliveryCount: metadata.deliveryCount,
        }),
      };
    },
  },
);
