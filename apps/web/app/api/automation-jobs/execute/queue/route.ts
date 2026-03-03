import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { forwardQueueMessageToInternalApi } from "@/utils/queue/forward-to-internal-api";

export const maxDuration = 300;

const logger = createScopedLogger("automation-jobs/execute/queue");

const payloadSchema = z.object({
  automationJobRunId: z.string().min(1, "Automation job run ID is required"),
});

export const POST = handleCallback<z.infer<typeof payloadSchema>>(
  async (message, metadata) => {
    const parseResult = payloadSchema.safeParse(message);
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

    await forwardQueueMessageToInternalApi({
      path: "/api/automation-jobs/execute",
      body: parseResult.data,
      logger: runLogger,
    });
  },
  {
    visibilityTimeoutSeconds: 290,
    retry: (_error, metadata) => {
      const backoffSeconds = Math.min(300, 2 ** metadata.deliveryCount * 5);
      return { afterSeconds: backoffSeconds };
    },
  },
);
