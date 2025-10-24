#!/usr/bin/env node
/**
 * BullMQ Worker Process
 *
 * This runs as a separate process from the Next.js application
 * Start with: npm run worker
 */

import { createScopedLogger } from "@/utils/logger";
import { registerWorker, shutdownAllWorkers } from "@/utils/queue/worker";
import { QUEUE_HANDLERS, type QueueName } from "@/utils/queue/queues";
import { env } from "@/env";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("worker-process");

async function startWorkers() {
  if (env.QUEUE_SYSTEM !== "redis") {
    logger.info("Worker process not needed - using QStash", {
      queueSystem: env.QUEUE_SYSTEM,
    });
    process.exit(0);
  }

  logger.info("Starting BullMQ worker process", {
    nodeEnv: process.env.NODE_ENV,
    queueCount: Object.keys(QUEUE_HANDLERS).length,
  });

  // Worker should fail if it can't connect to the database
  try {
    await prisma.$connect();
    logger.info("Database connected successfully");
  } catch (error) {
    logger.error("Failed to connect to database", { error });
    process.exit(1);
  }

  // The recommended BullMQ approach is to register a worker for each queue
  let successCount = 0;
  for (const [queueName, handler] of Object.entries(QUEUE_HANDLERS)) {
    const worker = registerWorker(queueName as QueueName, async (job) => {
      logger.info("Processing job", {
        queueName,
        jobId: job.id,
        data: JSON.stringify(job.data),
      });

      try {
        await handler(job.data);

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
        throw error; // Re-throw to let BullMQ handle retries
      }
    });

    if (worker) {
      successCount++;
      logger.info("Worker registered successfully", {
        queueName,
        concurrency: worker.opts.concurrency,
      });
    } else {
      logger.error("Failed to register worker", { queueName });
    }
  }

  logger.info("Worker process started", {
    totalQueues: Object.keys(QUEUE_HANDLERS).length,
    successfulWorkers: successCount,
  });

  process.stdin.resume();
}

async function shutdown() {
  logger.info("Shutting down worker process...");

  try {
    await shutdownAllWorkers();
    await prisma.$disconnect();
    logger.info("Worker process shut down successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error });
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message });
  shutdown();
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason });
  shutdown();
});

startWorkers().catch((error) => {
  logger.error("Failed to start workers", { error });
  process.exit(1);
});
