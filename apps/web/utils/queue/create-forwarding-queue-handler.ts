import { handleCallback } from "@vercel/queue";
import type { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { forwardQueueMessageToInternalApi } from "@/utils/queue/forward-to-internal-api";
import { getQueueRetryBackoffSeconds } from "@/utils/queue/retry";

type QueueMetadata = {
  messageId: string;
  deliveryCount: number;
};

export function createForwardingQueueHandler<TSchema extends z.ZodTypeAny>({
  loggerScope,
  schema,
  path,
  invalidPayloadMessage,
  visibilityTimeoutSeconds,
  getLoggerContext,
  getTraceContext,
}: {
  loggerScope: string;
  schema: TSchema;
  path: string;
  invalidPayloadMessage: string;
  visibilityTimeoutSeconds: number;
  getLoggerContext?: (
    payload: z.infer<TSchema>,
    metadata: QueueMetadata,
  ) => Record<string, unknown>;
  getTraceContext?: (
    payload: z.infer<TSchema>,
    metadata: QueueMetadata,
  ) => Record<string, unknown>;
}) {
  const logger = createScopedLogger(loggerScope);

  return handleCallback<z.infer<TSchema>>(
    async (message, metadata) => {
      const parseResult = schema.safeParse(message);
      if (!parseResult.success) {
        logger.error(invalidPayloadMessage, {
          errors: parseResult.error.errors,
          queueMessageId: metadata.messageId,
        });
        return;
      }

      const runLogger = logger.with({
        ...getLoggerContext?.(parseResult.data, metadata),
        queueMessageId: metadata.messageId,
        deliveryCount: metadata.deliveryCount,
      });

      const traceContext = getTraceContext?.(parseResult.data, metadata);
      if (traceContext) {
        runLogger.trace("Forwarding queue message", traceContext);
      }

      await forwardQueueMessageToInternalApi({
        path,
        body: parseResult.data,
        logger: runLogger,
      });
    },
    {
      visibilityTimeoutSeconds,
      retry: (_error, metadata) => {
        return {
          afterSeconds: getQueueRetryBackoffSeconds({
            deliveryCount: metadata.deliveryCount,
          }),
        };
      },
    },
  );
}
