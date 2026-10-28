import { send } from "@vercel/queue";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  publishToInternalApiInBackground,
  publishToQstashQueue,
} from "@/utils/upstash";
import { isVercelQueueDispatchEnabled } from "@/utils/queue/vercel";
import { enqueueBullmqHttpJob } from "@/utils/queue/bullmq";
import { getQueueBackend } from "@/utils/queue/backend";

export async function enqueueBackgroundJob<T>({
  topic,
  body,
  qstash,
  vercel,
  logger,
}: {
  topic: string;
  body: T;
  vercel?: {
    // Vercel Queues has no per-topic parallelism cap, so large fan-outs spread delivery out instead.
    delaySeconds?: number;
  };
  qstash: {
    queueName: string;
    parallelism: number;
    path: string;
    headers?: HeadersInit;
    deduplicationId?: string;
  };
  logger: Logger;
}) {
  if (isVercelQueueDispatchEnabled()) {
    try {
      await send(topic, body, { delaySeconds: vercel?.delaySeconds });
      return "vercel";
    } catch (error) {
      logger.error("Failed to enqueue Vercel queue message", {
        topic,
        error,
      });
    }
  }

  const backend = getQueueBackend();

  if (backend === "bullmq") {
    if (env.REDIS_URL) {
      await enqueueBullmqHttpJob({
        queueName: qstash.queueName,
        path: qstash.path,
        body,
        headers: qstash.headers,
      });

      return "bullmq";
    }

    logger.warn("QUEUE_BACKEND=bullmq but REDIS_URL is not configured", {
      topic,
      queueName: qstash.queueName,
    });
  }

  if (backend === "internal") {
    await publishToInternalApiInBackground({
      path: qstash.path,
      body,
      headers: qstash.headers,
    });

    return "internal-fallback";
  }

  await publishToQstashQueue({
    queueName: qstash.queueName,
    parallelism: qstash.parallelism,
    path: qstash.path,
    body,
    headers: qstash.headers,
    deduplicationId: qstash.deduplicationId,
  });

  return env.QSTASH_TOKEN ? "qstash" : "internal-fallback";
}
