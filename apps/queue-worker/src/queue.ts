import {
  Queue,
  Worker,
  type JobsOptions,
  type ConnectionOptions,
} from "bullmq";
import { env } from "./env";
import { processJob, type WorkerJobData } from "./processor";

type QueueRecord = {
  queue: Queue<WorkerJobData>;
  worker: Worker<WorkerJobData>;
  concurrency: number;
};

const queues = new Map<string, QueueRecord>();

const connection: ConnectionOptions = {
  url: env.REDIS_URL,
};

export function getOrCreateQueue(
  queueName: string,
  concurrency?: number,
): Queue<WorkerJobData> {
  let record = queues.get(queueName);
  if (record) {
    return record.queue;
  }
  const workerConcurrency = concurrency ?? env.DEFAULT_CONCURRENCY;
  const queue = new Queue<WorkerJobData>(queueName, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 5 },
      attempts: 5,
    } as JobsOptions,
  });
  const worker = new Worker<WorkerJobData>(
    queueName,
    async (job) => {
      await processJob(job.data);
    },
    {
      connection,
      concurrency: workerConcurrency,
    },
  );
  record = { queue, worker, concurrency: workerConcurrency };
  queues.set(queueName, record);
  return queue;
}

export async function enqueue(
  queueName: string,
  data: WorkerJobData,
  options?: JobsOptions & { parallelism?: number },
) {
  const queue = getOrCreateQueue(queueName, options?.parallelism);
  const job = await queue.add(queueName, data, {
    delay: options?.delay,
    attempts: options?.attempts ?? 5,
    priority: options?.priority,
    removeOnComplete: options?.removeOnComplete ?? { count: 10 },
    removeOnFail: options?.removeOnFail ?? { count: 5 },
    jobId: options?.jobId as string | undefined,
  });
  return job.id;
}

export async function bulkEnqueue(
  queueName: string,
  items: Array<{ data: WorkerJobData; options?: JobsOptions }>,
  options?: {
    delay?: number;
    attempts?: number;
    priority?: number;
    parallelism?: number;
    removeOnComplete?: number | boolean;
    removeOnFail?: number | boolean;
  },
) {
  const queue = getOrCreateQueue(queueName, options?.parallelism);
  const jobs = items.map((item) => ({
    name: queueName,
    data: item.data,
    opts: {
      delay: item.options?.delay ?? options?.delay,
      attempts: item.options?.attempts ?? options?.attempts ?? 5,
      priority: item.options?.priority ?? options?.priority,
      removeOnComplete: item.options?.removeOnComplete ??
        options?.removeOnComplete ?? { count: 10 },
      removeOnFail: item.options?.removeOnFail ??
        options?.removeOnFail ?? { count: 5 },
      jobId: item.options?.jobId,
    } as JobsOptions,
  }));
  const added = await queue.addBulk(jobs);
  return added.map((j) => j.id as string);
}
