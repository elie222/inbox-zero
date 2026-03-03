import { send } from "@vercel/queue";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { publishToQstashQueue } from "@/utils/upstash";

export async function enqueueBackgroundJob<T>({
  topic,
  body,
  qstash,
  logger,
}: {
  topic: string;
  body: T;
  qstash: {
    queueName: string;
    parallelism: number;
    path: string;
    headers?: HeadersInit;
  };
  logger?: Logger;
}) {
  if (shouldUseQstashQueue()) {
    await publishToQstashQueue({
      queueName: qstash.queueName,
      parallelism: qstash.parallelism,
      path: qstash.path,
      body,
      headers: qstash.headers,
    });

    return "qstash";
  }

  if (isVercelQueueDispatchEnabled()) {
    try {
      await send(topic, body);
      return "vercel";
    } catch (error) {
      logger?.error("Failed to enqueue Vercel queue message", {
        topic,
        error,
      });
    }
  }

  await publishToQstashQueue({
    queueName: qstash.queueName,
    parallelism: qstash.parallelism,
    path: qstash.path,
    body,
    headers: qstash.headers,
  });

  return "internal-fallback";
}

function shouldUseQstashQueue() {
  return !!env.QSTASH_TOKEN;
}

function isVercelQueueDispatchEnabled() {
  return process.env.VERCEL === "1";
}
