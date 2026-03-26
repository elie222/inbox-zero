import { Worker } from "bullmq";
import IORedis from "ioredis";

const INTERNAL_API_KEY_HEADER = "x-api-key";
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_QUEUES = [
  { name: "automation-jobs", concurrency: 3 },
  { name: "digest-item-summarize", concurrency: 3 },
  { name: "email-summary-all", concurrency: 3 },
  { name: "email-digest-all", concurrency: 3 },
];

export async function startWorkerRuntime({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const config = getWorkerConfig(env);
  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const workers = parseWorkerQueues(config.workerQueues).map(
    ({ name, concurrency }) =>
      new Worker(
        name,
        async (job) => {
          await forwardJob({
            path: job.data?.path,
            body: job.data?.body,
            headers: job.data?.headers,
            queueName: name,
            jobId: String(job.id),
            internalApiKey: config.internalApiKey,
            internalApiUrl: config.internalApiUrl,
            fetchImpl,
          });
        },
        {
          connection,
          concurrency,
        },
      ),
  );

  for (const worker of workers) {
    worker.on("ready", () => {
      log(
        `[worker] listening on queue "${worker.name}" with concurrency ${worker.opts.concurrency}`,
      );
    });

    worker.on("error", (error) => {
      logError(`[worker] queue "${worker.name}" error`, error);
    });

    worker.on("failed", (job, error) => {
      logError(
        `[worker] job failed on "${worker.name}"`,
        {
          jobId: job?.id,
          path: job?.data?.path,
        },
        error,
      );
    });
  }

  log(
    `[worker] started with queues: ${workers.map((worker) => worker.name).join(", ")}`,
  );

  return {
    connection,
    workers,
    async close() {
      await Promise.allSettled(workers.map((worker) => worker.close()));
      await connection.quit();
    },
  };
}

export async function forwardJob({
  path,
  body,
  headers,
  queueName,
  jobId,
  internalApiKey,
  internalApiUrl,
  fetchImpl = fetch,
}) {
  if (!path || typeof path !== "string") {
    throw new Error(`Queue job "${jobId}" on "${queueName}" is missing a path`);
  }

  const requestHeaders = new Headers(headers || {});
  requestHeaders.set("content-type", "application/json");
  requestHeaders.set(INTERNAL_API_KEY_HEADER, internalApiKey);

  const response = await fetchImpl(`${internalApiUrl}${path}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(300_000),
  });

  if (response.ok) return;

  const errorText = await response.text();
  throw new Error(
    `Worker forwarding failed with ${response.status} for ${path}: ${errorText.slice(0, 500)}`,
  );
}

function getWorkerConfig(env) {
  const redisUrl = env.REDIS_URL;
  const internalApiKey = env.INTERNAL_API_KEY;
  const internalApiUrl = normalizeBaseUrl(
    env.INTERNAL_API_URL || env.NEXT_PUBLIC_BASE_URL,
  );

  if (!redisUrl) {
    throw new Error("REDIS_URL is required for the BullMQ worker");
  }

  if (!internalApiKey) {
    throw new Error("INTERNAL_API_KEY is required for the BullMQ worker");
  }

  if (!internalApiUrl) {
    throw new Error(
      "INTERNAL_API_URL or NEXT_PUBLIC_BASE_URL is required for the BullMQ worker",
    );
  }

  return {
    internalApiKey,
    internalApiUrl,
    redisUrl,
    workerQueues: env.WORKER_QUEUES,
  };
}

function parseWorkerQueues(value) {
  if (!value) return DEFAULT_QUEUES;

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, concurrencyValue] = entry
        .split(":")
        .map((part) => part.trim());
      const concurrency = Number.parseInt(
        concurrencyValue || String(DEFAULT_CONCURRENCY),
        10,
      );

      return {
        name,
        concurrency:
          Number.isFinite(concurrency) && concurrency > 0
            ? concurrency
            : DEFAULT_CONCURRENCY,
      };
    });
}

function normalizeBaseUrl(url) {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function log(message, ...details) {
  process.stdout.write(formatLogLine(message, details));
}

function logError(message, ...details) {
  process.stderr.write(formatLogLine(message, details));
}

function formatLogLine(message, details) {
  const serializedDetails = details
    .filter((detail) => detail !== undefined)
    .map((detail) =>
      typeof detail === "string" ? detail : JSON.stringify(detail),
    );

  return serializedDetails.length > 0
    ? `${message} ${serializedDetails.join(" ")}\n`
    : `${message}\n`;
}
