import type {
  Queue,
  Worker,
  QueueEvents,
  Job,
  ConnectionOptions,
} from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { QStashManager } from "./providers/qstash-manager";
import { BullMQManager } from "./providers/bullmq-manager";
import type {
  QueueJobData,
  EnqueueOptions,
  BulkEnqueueOptions,
  QueueManager,
  QueueSystemInfo,
} from "./types";

const logger = createScopedLogger("queue");

export function createQueueManager(): QueueManager {
  const queueSystem = env.QUEUE_SYSTEM;

  logger.info("Creating queue manager", { queueSystem });

  switch (queueSystem) {
    case "redis":
      return new BullMQManager();
    case "upstash":
      return new QStashManager();
    default:
      throw new Error(`Unsupported queue system: ${queueSystem}`);
  }
}

let queueManager: QueueManager | null = null;

export function getQueueManager(): QueueManager {
  if (!queueManager) {
    queueManager = createQueueManager();
  }
  return queueManager;
}

// Utility functions for common queue operations
export async function enqueueJob<T extends QueueJobData>(
  queueName: string,
  data: T,
  options?: EnqueueOptions,
): Promise<Job<T> | string> {
  const manager = getQueueManager();
  return manager.enqueue(queueName, data, options);
}

export async function bulkEnqueueJobs<T extends QueueJobData>(
  queueName: string,
  options: BulkEnqueueOptions,
): Promise<Job<T>[] | string[]> {
  const manager = getQueueManager();
  return manager.bulkEnqueue(queueName, options);
}

export function createQueueWorker<T extends QueueJobData>(
  _queueName: string,
  _processor: (job: Job<T>) => Promise<void>,
  _options?: {
    concurrency?: number;
    connection?: ConnectionOptions;
  },
): Worker | null {
  logger.warn("createQueueWorker is disabled; using external worker service", {
    queueSystem: env.QUEUE_SYSTEM,
    queueName: _queueName,
  });
  return null;
}

export function createQueue<T extends QueueJobData>(
  _queueName: string,
  _options?: {
    connection?: ConnectionOptions;
    defaultJobOptions?: Record<string, unknown>;
  },
): Queue<T> | null {
  logger.warn(
    "createQueue is disabled; queues are managed by the worker service",
    {
      queueSystem: env.QUEUE_SYSTEM,
      queueName: _queueName,
    },
  );
  return null;
}

export async function closeQueueManager(): Promise<void> {
  if (queueManager) {
    await queueManager.close();
    queueManager = null;
  }
}

export function getQueueSystemInfo(): QueueSystemInfo {
  const isRedis = env.QUEUE_SYSTEM === "redis";
  return {
    system: env.QUEUE_SYSTEM,
    supportsWorkers: isRedis,
    supportsDelayedJobs: true,
    supportsBulkOperations: true,
  };
}

export type { Queue, Worker, QueueEvents, Job, ConnectionOptions };
export type {
  QueueSystem,
  QueueJobData,
  QueueConfig,
  EnqueueOptions,
  BulkEnqueueOptions,
  QueueManager,
  QueueSystemInfo,
  WorkerConfig,
  JobProcessor,
} from "./types";
