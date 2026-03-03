import { handleCallback } from "@vercel/queue";
import type { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { forwardQueueMessageToInternalApi } from "@/utils/queue/forward-to-internal-api";
import { sendDigestEmailBody } from "../validation";

export const maxDuration = 60;

const logger = createScopedLogger("resend/digest/queue");

export const POST = handleCallback<z.infer<typeof sendDigestEmailBody>>(
  async (message, metadata) => {
    const parseResult = sendDigestEmailBody.safeParse(message);
    if (!parseResult.success) {
      logger.error("Invalid resend digest queue payload", {
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
      path: "/api/resend/digest",
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
