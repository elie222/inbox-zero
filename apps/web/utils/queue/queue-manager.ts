import type {
  Queue,
  Worker,
  QueueEvents,
  Job,
  ConnectionOptions,
} from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { BullMQManager } from "./bullmq-manager";
import { QStashManager } from "./qstash-manager";
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
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: {
    concurrency?: number;
    connection?: ConnectionOptions;
  },
): Worker | null {
  const manager = getQueueManager();

  // Only BullMQ supports workers; QStash uses HTTP endpoints
  if (env.QUEUE_SYSTEM !== "redis") {
    logger.warn("Workers not supported for queue system", {
      queueSystem: env.QUEUE_SYSTEM,
      queueName,
    });
    return null;
  }

  return manager.createWorker(queueName, processor, options);
}

export function createQueue<T extends QueueJobData>(
  queueName: string,
  options?: {
    connection?: ConnectionOptions;
    defaultJobOptions?: Record<string, unknown>;
  },
): Queue<T> | null {
  const manager = getQueueManager();

  // Only BullMQ supports queue creation; QStash uses HTTP endpoints
  if (env.QUEUE_SYSTEM !== "redis") {
    logger.warn("Queue creation not supported for queue system", {
      queueSystem: env.QUEUE_SYSTEM,
      queueName,
    });
    return null;
  }

  return manager.createQueue(queueName, options);
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
