import { env } from "@/env";

export type QueueBackend = "bullmq" | "internal" | "qstash";

export function getQueueBackend(): QueueBackend {
  if (env.QUEUE_BACKEND) return env.QUEUE_BACKEND;
  if (env.QSTASH_TOKEN) return "qstash";
  return "internal";
}
