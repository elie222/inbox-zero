import type {
  Queue,
  Worker,
  QueueEvents,
  Job,
  ConnectionOptions,
} from "bullmq";

export type QueueSystem = "redis" | "upstash";

export type { QueueName } from "./queues";

export interface QueueJobData {
  [key: string]: unknown;
}

export interface QueueSystemConfig {
  defaultParallelism: number;
  defaultConcurrency: number;
}

export interface QueueConfig {
  name: string;
  parallelism?: number;
  backoff?: {
    type: "fixed" | "exponential";
    delay: number;
  };
}

export interface EnqueueOptions {
  // seconds since epoch (QStash style). If provided, takes precedence over delay at worker.
  notBefore?: number;
  // QStash style name
  deduplicationId?: string;
  // Optional explicit callback path (e.g., "/api/clean/gmail"); defaults to "/api/queue/{queueName}"
  targetPath?: string;
  // Optional extra headers to include when the worker calls back
  headers?: Record<string, string>;
}

export interface BulkEnqueueOptions extends EnqueueOptions {
  jobs: Array<{
    name?: string;
    data: QueueJobData;
    opts?: EnqueueOptions;
  }>;
}

export interface QueueManager {
  enqueue<T extends QueueJobData>(
    queueName: string,
    data: T,
    options?: EnqueueOptions,
  ): Promise<Job<T> | string>;

  bulkEnqueue<T extends QueueJobData>(
    queueName: string,
    options: BulkEnqueueOptions,
  ): Promise<Job<T>[] | string[]>;

  createWorker<T extends QueueJobData>(
    queueName: string,
    processor: (job: Job<T>) => Promise<void>,
    options?: {
      concurrency?: number;
      connection?: ConnectionOptions;
    },
  ): Worker;

  createQueue<T extends QueueJobData>(
    queueName: string,
    options?: {
      connection?: ConnectionOptions;
      defaultJobOptions?: Record<string, unknown>;
    },
  ): Queue<T>;

  getQueueEvents(queueName: string): QueueEvents;

  close(): Promise<void>;
}

export interface WorkerConfig {
  concurrency?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
  maxStalledCount?: number;
  stalledInterval?: number;
}

export type JobProcessor<T = unknown> = (job: Job<T>) => Promise<void>;

export interface QueueSystemInfo {
  system: string;
  supportsWorkers: boolean;
  supportsDelayedJobs: boolean;
  supportsBulkOperations: boolean;
}

export type { Queue, Worker, QueueEvents, Job, ConnectionOptions };
