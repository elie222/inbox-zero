import { handleCallback } from "@vercel/queue";
import type { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { forwardQueueMessageToInternalApi } from "@/utils/queue/forward-to-internal-api";
import { sendSummaryEmailBody } from "../validation";

export const maxDuration = 60;

const logger = createScopedLogger("resend/summary/queue");

export const POST = handleCallback<z.infer<typeof sendSummaryEmailBody>>(
  async (message, metadata) => {
    const parseResult = sendSummaryEmailBody.safeParse(message);
    if (!parseResult.success) {
      logger.error("Invalid resend summary queue payload", {
        errors: parseResult.error.errors,
        queueMessageId: metadata.messageId,
      });
      return;
    }

    const runLogger = logger.with({
      emailAccountId: parseResult.data.emailAccountId,
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    });

    await forwardQueueMessageToInternalApi({
      path: "/api/resend/summary",
      body: parseResult.data,
      logger: runLogger,
    });
  },
  {
    visibilityTimeoutSeconds: 55,
    retry: (_error, metadata) => {
      const backoffSeconds = Math.min(300, 2 ** metadata.deliveryCount * 5);
      return { afterSeconds: backoffSeconds };
    },
  },
);
