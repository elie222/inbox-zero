import type {
  Job,
  Queue,
  QueueEvents,
  Worker,
  ConnectionOptions,
} from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import type {
  BulkEnqueueOptions,
  EnqueueOptions,
  QueueJobData,
  QueueManager,
} from "../types";

const logger = createScopedLogger("queue-http-worker");

function getWorkerBaseUrl(): string {
  const base = env.WORKER_BASE_URL;
  if (!base) {
    throw new Error(
      "WORKER_BASE_URL is required when using redis worker service",
    );
  }
  return base.replace(/\/+$/, "");
}

function getAuthHeaders(): Record<string, string> {
  if (!env.CRON_SECRET) {
    throw new Error(
      "CRON_SECRET is required to authenticate with worker service",
    );
  }
  return {
    authorization: `Bearer ${env.CRON_SECRET}`,
  };
}

export class BullMQManager implements QueueManager {
  async enqueue<T extends QueueJobData>(
    queueName: string,
    data: T,
    options: EnqueueOptions = {},
  ): Promise<Job<T> | string> {
    const url = `${getWorkerBaseUrl()}/v1/jobs`;
    const base = env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL || "";
    const callbackPath = options.targetPath ?? `/api/queue/${queueName}`;
    const callbackUrl =
      callbackPath.startsWith("http://") || callbackPath.startsWith("https://")
        ? callbackPath
        : `${base}${callbackPath}`;
    const body = {
      queueName,
      url: callbackUrl,
      body: data,
      options: {
        notBefore: options.notBefore,
        deduplicationId: options.deduplicationId,
        parallelism: undefined,
      },
      headers: options.headers,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error("Failed to enqueue via worker", {
        status: res.status,
        statusText: res.statusText,
        body: text,
      });
      throw new Error(
        `Worker enqueue failed (${res.status}): ${res.statusText}`,
      );
    }

    const json = (await res.json()) as { jobId: string };
    return json.jobId;
  }

  async bulkEnqueue<T extends QueueJobData>(
    queueName: string,
    options: BulkEnqueueOptions,
  ): Promise<Job<T>[] | string[]> {
    const url = `${getWorkerBaseUrl()}/v1/jobs/bulk`;
    const base = env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL || "";
    const body = {
      queueName,
      items: options.jobs.map((j) => ({
        url: (() => {
          const p =
            j.opts?.targetPath ??
            options.targetPath ??
            `/api/queue/${queueName}`;
          return p.startsWith("http://") || p.startsWith("https://")
            ? p
            : `${base}${p}`;
        })(),
        body: j.data,
        options: {
          notBefore: j.opts?.notBefore ?? options.notBefore,
          deduplicationId: j.opts?.deduplicationId ?? options.deduplicationId,
          parallelism: undefined,
        },
        headers: j.opts?.headers ?? options.headers,
      })),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error("Failed to bulk enqueue via worker", {
        status: res.status,
        statusText: res.statusText,
        body: text,
      });
      throw new Error(
        `Worker bulk enqueue failed (${res.status}): ${res.statusText}`,
      );
    }

    const json = (await res.json()) as { jobIds: string[] };
    return json.jobIds;
  }

  createWorker<T extends QueueJobData>(
    _queueName: string,
    _processor: (job: Job<T>) => Promise<void>,
    _options?: { concurrency?: number; connection?: ConnectionOptions },
  ): Worker {
    throw new Error(
      "createWorker is not supported when using HTTP worker service",
    );
  }

  createQueue<T extends QueueJobData>(
    _queueName: string,
    _options?: {
      connection?: ConnectionOptions;
      defaultJobOptions?: Record<string, unknown>;
    },
  ): Queue<T> {
    throw new Error(
      "createQueue is not supported when using HTTP worker service",
    );
  }

  getQueueEvents(_queueName: string): QueueEvents {
    throw new Error(
      "getQueueEvents is not supported when using HTTP worker service",
    );
  }

  async close(): Promise<void> {}
}
