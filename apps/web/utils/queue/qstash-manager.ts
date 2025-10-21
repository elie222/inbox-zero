import type { Job, ConnectionOptions } from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { publishToQstashQueue } from "@/utils/upstash";
import { Client } from "@upstash/qstash";
import type {
  QueueJobData,
  EnqueueOptions,
  BulkEnqueueOptions,
  QueueManager,
} from "./types";

const logger = createScopedLogger("queue-qstash");

// Default parallelism for QStash flow control
const DEFAULT_PARALLELISM = 3;

export class QStashManager implements QueueManager {
  async enqueue<T extends QueueJobData>(
    queueName: string,
    data: T,
    options: EnqueueOptions = {},
  ): Promise<string> {
    const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/queue/${queueName}`;

    if (options.delay) {
      const notBefore = Math.floor(Date.now() / 1000) + options.delay / 1000;
      const client = new Client({ token: env.QSTASH_TOKEN! });
      const response = await client.publishJSON({
        url,
        body: data,
        notBefore,
        deduplicationId: options.jobId,
      });
      return response?.messageId || "unknown";
    } else {
      const response = await publishToQstashQueue({
        queueName,
        parallelism: DEFAULT_PARALLELISM,
        url,
        body: data,
      });
      return response?.messageId || "unknown";
    }
  }

  async bulkEnqueue(
    queueName: string,
    options: BulkEnqueueOptions,
  ): Promise<string[]> {
    const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/queue/${queueName}`;

    const items = options.jobs.map((job) => {
      const item: {
        url: string;
        body: QueueJobData;
        notBefore?: number;
        deduplicationId?: string;
      } = {
        url,
        body: job.data,
      };

      if (options.delay) {
        item.notBefore = Math.floor(Date.now() / 1000) + options.delay / 1000;
      }

      if (job.opts?.jobId) {
        item.deduplicationId = job.opts.jobId;
      }

      return item;
    });

    const client = new Client({ token: env.QSTASH_TOKEN! });
    const response = await client.batchJSON(items);
    return response?.map((r) => r.messageId || "unknown") || [];
  }

  createWorker<T extends QueueJobData>(
    _queueName: string,
    _processor: (job: Job<T>) => Promise<void>,
    _options: {
      concurrency?: number;
      connection?: ConnectionOptions;
    } = {},
  ): never {
    throw new Error(
      "QStash workers are handled via HTTP endpoints, not BullMQ workers",
    );
  }

  createQueue(
    _queueName: string,
    _options: {
      connection?: ConnectionOptions;
      defaultJobOptions?: Record<string, unknown>;
    } = {},
  ): never {
    throw new Error("QStash queues are managed by QStash, not BullMQ");
  }

  getQueueEvents(_queueName: string): never {
    throw new Error("QStash queue events are not available through BullMQ");
  }

  async close(): Promise<void> {
    // QStash doesn't require closing connections
    logger.info("QStash manager closed");
  }
}
