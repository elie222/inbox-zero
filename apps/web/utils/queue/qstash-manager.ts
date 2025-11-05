import type { Job, ConnectionOptions } from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
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

function getQstashClient(): Client {
  return new Client({ token: env.QSTASH_TOKEN! });
}

export class QStashManager implements QueueManager {
  async enqueue<T extends QueueJobData>(
    queueName: string,
    data: T,
    options: EnqueueOptions = {},
  ): Promise<string> {
    const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/queue/${queueName}`;
    const client = getQstashClient();

    if (options.delay) {
      const notBefore = Math.ceil((Date.now() + options.delay) / 1000);
      const response = await client.publishJSON({
        url,
        body: data,
        notBefore,
        deduplicationId: options.jobId,
      });
      return response?.messageId || "unknown";
    } else {
      // Use queue.enqueueJSON to support deduplicationId
      const queue = client.queue({ queueName });
      await queue.upsert({ parallelism: DEFAULT_PARALLELISM });
      const response = await queue.enqueueJSON({
        url,
        body: data,
        deduplicationId: options.jobId,
      });
      return response?.messageId || "unknown";
    }
  }

  async bulkEnqueue(
    queueName: string,
    options: BulkEnqueueOptions,
  ): Promise<string[]> {
    const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/queue/${queueName}`;

    // For ai-clean queue, use per-account queues to maintain parallelism limits per account
    // This ensures each account has its own queue with parallelism=3, preventing one account
    // from flooding the global queue and maintaining the per-user parallelism safeguard.
    if (queueName === "ai-clean") {
      // Group jobs by emailAccountId (all jobs should have emailAccountId in their data)
      const jobsByAccount = new Map<string, typeof options.jobs>();
      for (const job of options.jobs) {
        const emailAccountId = (job.data as { emailAccountId?: string })
          .emailAccountId;
        if (!emailAccountId) {
          logger.warn(
            "Job missing emailAccountId, skipping per-account queue grouping",
            {
              queueName,
            },
          );
          continue;
        }
        const accountQueueName = `${queueName}-${emailAccountId}`;
        let jobs = jobsByAccount.get(accountQueueName);
        if (!jobs) {
          jobs = [];
          jobsByAccount.set(accountQueueName, jobs);
        }
        jobs.push(job);
      }

      // Use publishToQstashQueue for each account's queue with parallelism=3
      // First, ensure each account's queue exists with the correct parallelism
      const client = getQstashClient();
      const results: string[] = [];
      for (const [accountQueueName, accountJobs] of jobsByAccount) {
        // Create/update the queue with parallelism=3 for this account
        const queue = client.queue({ queueName: accountQueueName });
        await queue.upsert({ parallelism: DEFAULT_PARALLELISM });

        // Enqueue all jobs for this account
        const accountResults = await Promise.all(
          accountJobs.map(async (job) => {
            if (options.delay) {
              // For delayed jobs, use publishJSON with notBefore
              const notBefore = Math.ceil((Date.now() + options.delay) / 1000);
              const response = await queue.enqueueJSON({
                url,
                body: job.data,
                notBefore,
                deduplicationId: job.opts?.jobId,
              });
              return response?.messageId || "unknown";
            } else {
              // For immediate jobs, use enqueueJSON
              const response = await queue.enqueueJSON({
                url,
                body: job.data,
                deduplicationId: job.opts?.jobId,
              });
              return response?.messageId || "unknown";
            }
          }),
        );
        results.push(...accountResults);
      }
      return results;
    }

    // For other queues, use the original batchJSON approach
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
        item.notBefore = Math.ceil((Date.now() + options.delay) / 1000);
      }

      if (job.opts?.jobId) {
        item.deduplicationId = job.opts.jobId;
      }

      return item;
    });

    const client = getQstashClient();
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
