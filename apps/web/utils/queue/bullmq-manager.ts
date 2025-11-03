import {
  Queue,
  Worker,
  QueueEvents,
  type Job,
  type ConnectionOptions,
} from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import type {
  QueueJobData,
  EnqueueOptions,
  BulkEnqueueOptions,
  QueueManager,
} from "./types";

export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_ATTEMPTS = 5;

const logger = createScopedLogger("queue-bullmq");

export class BullMQManager implements QueueManager {
  private readonly queues: Map<string, Queue> = new Map();
  private readonly workers: Map<string, Worker> = new Map();
  private readonly queueEvents: Map<string, QueueEvents> = new Map();
  private readonly connection: ConnectionOptions;

  constructor() {
    if (!env.REDIS_URL) {
      throw new Error("REDIS_URL is required for BullMQ");
    }

    this.connection = {
      url: env.REDIS_URL,
    } as unknown as ConnectionOptions;
  }

  async enqueue<T extends QueueJobData>(
    queueName: string,
    data: T,
    options: EnqueueOptions = {},
  ): Promise<Job<T>> {
    const queue = this.getOrCreateQueue(queueName);

    const jobOptions = {
      delay: options.delay,
      attempts: options.attempts ?? DEFAULT_ATTEMPTS,
      priority: options.priority,
      removeOnComplete: options.removeOnComplete ?? 10,
      removeOnFail: options.removeOnFail ?? 5,
      jobId: options.jobId,
    };

    const job = await queue.add(queueName, data, jobOptions);

    logger.info("Job enqueued with BullMQ", {
      queueName,
      jobId: job.id,
      data: JSON.stringify(data),
    });

    return job as Job<T>;
  }

  async bulkEnqueue<T extends QueueJobData>(
    queueName: string,
    options: BulkEnqueueOptions,
  ): Promise<Job<T>[]> {
    const queue = this.getOrCreateQueue(queueName);

    const jobs = options.jobs.map((jobData) => ({
      name: jobData.name ?? queueName,
      data: jobData.data,
      opts: {
        delay: options.delay,
        attempts: options.attempts ?? DEFAULT_ATTEMPTS,
        priority: options.priority,
        removeOnComplete: options.removeOnComplete ?? 10,
        removeOnFail: options.removeOnFail ?? 5,
        jobId: jobData.opts?.jobId,
        ...jobData.opts,
      },
    }));

    const addedJobs = await queue.addBulk(jobs);

    logger.info("Bulk jobs enqueued with BullMQ", {
      queueName,
      jobCount: addedJobs.length,
    });

    return addedJobs as Job<T>[];
  }

  createWorker<T extends QueueJobData>(
    queueName: string,
    processor: (job: Job<T>) => Promise<void>,
    options: {
      concurrency?: number;
      connection?: ConnectionOptions;
    } = {},
  ): Worker {
    const worker = new Worker(
      queueName,
      async (job) => {
        logger.info("Processing job", {
          queueName,
          jobId: job.id,
          data: JSON.stringify(job.data),
        });

        try {
          await processor(job);
          logger.info("Job completed successfully", {
            queueName,
            jobId: job.id,
          });
        } catch (error) {
          logger.error("Job failed", {
            queueName,
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      {
        connection: options.connection || this.connection,
        concurrency: options.concurrency || DEFAULT_CONCURRENCY,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 5 },
      },
    );

    this.workers.set(queueName, worker);
    return worker;
  }

  createQueue<T extends QueueJobData>(
    queueName: string,
    options: {
      connection?: ConnectionOptions;
      defaultJobOptions?: Record<string, unknown>;
    } = {},
  ): Queue<T> {
    const queue = new Queue<T>(queueName, {
      connection: options.connection || this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 5 },
        attempts: DEFAULT_ATTEMPTS,
        ...options.defaultJobOptions,
      },
    });

    this.queues.set(queueName, queue);
    return queue;
  }

  getQueueEvents(queueName: string): QueueEvents {
    if (!this.queueEvents.has(queueName)) {
      const queueEvents = new QueueEvents(queueName, {
        connection: this.connection,
      });
      this.queueEvents.set(queueName, queueEvents);
    }
    return this.queueEvents.get(queueName)!;
  }

  private getOrCreateQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      this.createQueue(queueName);
    }
    return this.queues.get(queueName)!;
  }

  async close(): Promise<void> {
    // Close all workers
    for (const [name, worker] of this.workers) {
      logger.info("Closing worker", { queueName: name });
      await worker.close();
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      logger.info("Closing queue", { queueName: name });
      await queue.close();
    }

    // Close all queue events
    for (const [name, queueEvents] of this.queueEvents) {
      logger.info("Closing queue events", { queueName: name });
      await queueEvents.close();
    }

    this.queues.clear();
    this.workers.clear();
    this.queueEvents.clear();
  }
}
