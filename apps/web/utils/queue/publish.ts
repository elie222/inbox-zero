import { env } from "@/env";
import { publishToQstash } from "@/utils/upstash";
import { enqueueJob } from "@/utils/queue/queue-manager";
import type { FlowControl } from "@upstash/qstash";
import type { QueueJobData } from "@/utils/queue/types";

export async function publishFlowControlled<T extends QueueJobData>({
  url,
  body,
  flowControl,
  redisQueueName,
  headers,
}: {
  url: string;
  body: T;
  flowControl?: FlowControl;
  redisQueueName: string;
  headers?: Record<string, string>;
}) {
  if (env.QUEUE_SYSTEM === "upstash") {
    return publishToQstash<T>(url, body, flowControl);
  }
  return enqueueJob(redisQueueName, body, {
    targetPath: url,
    headers,
  });
}
