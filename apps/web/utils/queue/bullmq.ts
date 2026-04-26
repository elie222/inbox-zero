import "server-only";

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";

type BullmqHttpJob = {
  body: unknown;
  headers?: Record<string, string>;
  path: string;
};

const DEFAULT_JOB_ATTEMPTS = 3;
const DEFAULT_REMOVE_ON_COMPLETE = 1000;
const DEFAULT_REMOVE_ON_FAIL = 1000;

let connection: IORedis | null = null;
const queues = new Map<string, Queue<BullmqHttpJob>>();

export async function enqueueBullmqHttpJob({
  queueName,
  path,
  body,
  headers,
}: {
  queueName: string;
  path: string;
  body: unknown;
  headers?: HeadersInit;
}) {
  const queue = getBullmqQueue(queueName);

  await queue.add(
    path,
    {
      path,
      body,
      headers: normalizeHeaders(headers),
    },
    {
      attempts: DEFAULT_JOB_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
      removeOnFail: DEFAULT_REMOVE_ON_FAIL,
    },
  );
}

function getBullmqQueue(queueName: string) {
  const existingQueue = queues.get(queueName);
  if (existingQueue) return existingQueue;

  const queue = new Queue<BullmqHttpJob>(queueName, {
    connection: getBullmqConnection(),
  });
  queues.set(queueName, queue);
  return queue;
}

function getBullmqConnection() {
  if (connection) return connection;

  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required when QUEUE_BACKEND=bullmq");
  }

  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  return connection;
}

function normalizeHeaders(headers?: HeadersInit) {
  if (!headers) return undefined;

  const normalized = new Headers(headers);
  const record: Record<string, string> = {};

  for (const [key, value] of normalized.entries()) {
    record[key] = value;
  }

  return Object.keys(record).length > 0 ? record : undefined;
}
