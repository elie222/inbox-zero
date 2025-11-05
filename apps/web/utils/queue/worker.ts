import "server-only";
import type { Worker } from "bullmq";
import { createScopedLogger } from "@/utils/logger";
import { createQueueWorker, closeQueueManager } from "./queue-manager";
import type { WorkerConfig, JobProcessor } from "./types";
import { DEFAULT_CONCURRENCY } from "./bullmq-manager";

const logger = createScopedLogger("queue-worker");

class WorkerRegistry {
  private readonly workers: Map<string, Worker> = new Map();
  private isShuttingDown = false;

  registerWorker<T = unknown>(
    queueName: string,
    processor: JobProcessor<T>,
    config: WorkerConfig = {},
  ): Worker | null {
    if (this.workers.has(queueName)) {
      logger.warn("Worker already registered for queue", { queueName });
      return this.workers.get(queueName)!;
    }

    const worker = createQueueWorker(queueName, processor as JobProcessor, {
      concurrency: config.concurrency || DEFAULT_CONCURRENCY,
    });

    if (!worker) {
      logger.error("Failed to create worker", { queueName });
      return null;
    }

    worker.on("completed", (job) => {
      const logData: Record<string, unknown> = {
        queueName,
        jobId: job.id,
      };

      if (typeof job.processedOn === "number") {
        logData.duration = Date.now() - job.processedOn;
        logData.processedOn = job.processedOn;
      }

      logger.info("Job completed", logData);
    });

    worker.on("failed", (job, err) => {
      logger.error("Job failed", {
        queueName,
        jobId: job?.id,
        error: err.message,
        attempts: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
      });
    });

    worker.on("stalled", (jobId) => {
      logger.warn("Job stalled", { queueName, jobId });
    });

    worker.on("error", (err) => {
      logger.error("Worker error", {
        queueName,
        error: err.message,
      });
    });

    this.workers.set(queueName, worker);
    logger.info("Worker registered", {
      queueName,
      concurrency: config.concurrency,
    });

    return worker;
  }

  async unregisterWorker(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (!worker) {
      logger.warn("No worker found for queue", { queueName });
      return;
    }

    await worker.close();
    this.workers.delete(queueName);
    logger.info("Worker unregistered", { queueName });
  }

  getWorkers(): Map<string, Worker> {
    return new Map(this.workers);
  }

  getWorker(queueName: string): Worker | undefined {
    return this.workers.get(queueName);
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn("Shutdown already in progress");
      return;
    }

    this.isShuttingDown = true;
    logger.info("Shutting down all workers", {
      workerCount: this.workers.size,
    });

    const shutdownPromises = Array.from(this.workers.entries()).map(
      async ([queueName, worker]) => {
        try {
          logger.info("Closing worker", { queueName });
          await worker.close();
        } catch (error) {
          logger.error("Error closing worker", {
            queueName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    await Promise.all(shutdownPromises);
    this.workers.clear();
    this.isShuttingDown = false;
    logger.info("All workers shut down");
  }
}

const workerRegistry = new WorkerRegistry();
export function registerWorker<T = unknown>(
  queueName: string,
  processor: JobProcessor<T>,
  config: WorkerConfig = {},
): Worker | null {
  return workerRegistry.registerWorker(queueName, processor, config);
}

export function unregisterWorker(queueName: string): Promise<void> {
  return workerRegistry.unregisterWorker(queueName);
}

export function getWorker(queueName: string): Worker | undefined {
  return workerRegistry.getWorker(queueName);
}

export function getAllWorkers(): Map<string, Worker> {
  return workerRegistry.getWorkers();
}

export async function shutdownAllWorkers(): Promise<void> {
  await workerRegistry.shutdown();
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down workers...");
  await shutdownAllWorkers();
  await closeQueueManager();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down workers...");
  await shutdownAllWorkers();
  await closeQueueManager();
  process.exit(0);
});

export { workerRegistry };
