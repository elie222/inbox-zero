import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { processFollowUpRemindersForEmailAccountId } from "../../process";

export const maxDuration = 800;

const logger = createScopedLogger("follow-up-reminders/account/queue");

const queuePayloadSchema = z.object({
  emailAccountId: z.string().min(1),
});

export const POST = handleCallback<z.infer<typeof queuePayloadSchema>>(
  async (message, metadata) => {
    const parseResult = queuePayloadSchema.safeParse(message);
    if (!parseResult.success) {
      logger.error("Invalid follow-up reminder queue payload", {
        errors: parseResult.error.errors,
        queueMessageId: metadata.messageId,
      });
      return;
    }

    const { emailAccountId } = parseResult.data;
    const runLogger = logger.with({
      emailAccountId,
      queueMessageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    });

    try {
      const result = await processFollowUpRemindersForEmailAccountId({
        emailAccountId,
        logger: runLogger,
      });

      runLogger.info("Finished queued follow-up reminder account task", {
        result,
      });
    } catch (error) {
      runLogger.error("Failed queued follow-up reminder account task", {
        error,
      });
      captureException(error);
      throw error;
    }
  },
  {
    visibilityTimeoutSeconds: 780,
    retry: (_error, metadata) => {
      const backoffSeconds = Math.min(300, 2 ** metadata.deliveryCount * 5);
      return { afterSeconds: backoffSeconds };
    },
  },
);
