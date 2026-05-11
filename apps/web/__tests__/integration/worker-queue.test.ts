/**
 * Integration test: BullMQ queue dispatch forwards work through the worker runtime
 *
 * Verifies that enqueueBackgroundJob publishes BullMQ work and the worker runtime
 * forwards it to the internal API with the expected headers and body.
 *
 * Uses an in-memory BullMQ shim plus a local HTTP server to exercise the real
 * dispatch and worker code paths without needing a Redis binary in test.
 *
 * Usage:
 *   pnpm test-integration worker-queue
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const bullmqState = vi.hoisted(() => {
  let nextJobId = 1;
  const processors = new Map<string, Set<(job: any) => Promise<void>>>();

  return {
    reset() {
      nextJobId = 1;
      processors.clear();
    },
    register(queueName: string, processor: (job: any) => Promise<void>) {
      const queueProcessors = processors.get(queueName) || new Set();
      queueProcessors.add(processor);
      processors.set(queueName, queueProcessors);
    },
    unregister(queueName: string, processor: (job: any) => Promise<void>) {
      const queueProcessors = processors.get(queueName);
      if (!queueProcessors) return;

      queueProcessors.delete(processor);
      if (queueProcessors.size === 0) {
        processors.delete(queueName);
      }
    },
    async dispatch(queueName: string, job: any) {
      const queueProcessors = processors.get(queueName);
      if (!queueProcessors?.size) return;

      for (const processor of queueProcessors) {
        await processor(job);
      }
    },
    nextJobId() {
      return String(nextJobId++);
    },
  };
});

const redisState = vi.hoisted(() => {
  const instances: Array<{ closed: boolean; quit: () => Promise<void> }> = [];

  return {
    instances,
    reset() {
      instances.length = 0;
    },
  };
});

vi.mock("bullmq", () => {
  class Queue {
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    async add(name: string, data: unknown, opts: unknown) {
      const job = {
        id: bullmqState.nextJobId(),
        name,
        data,
        opts,
      };

      await bullmqState.dispatch(this.name, job);

      return job;
    }
  }

  class Worker {
    name: string;
    opts: Record<string, unknown>;
    readonly #listeners = new Map<string, Set<(...args: any[]) => void>>();
    readonly #processor: (job: any) => Promise<void>;

    constructor(
      name: string,
      processor: (job: any) => Promise<void>,
      opts: Record<string, unknown>,
    ) {
      this.name = name;
      this.opts = opts;
      this.#processor = async (job: any) => {
        try {
          await processor(job);
        } catch (error) {
          this.emit("failed", job, error);
          throw error;
        }
      };

      bullmqState.register(name, this.#processor);
      queueMicrotask(() => this.emit("ready"));
    }

    on(event: string, handler: (...args: any[]) => void) {
      const handlers = this.#listeners.get(event) || new Set();
      handlers.add(handler);
      this.#listeners.set(event, handlers);
      return this;
    }

    emit(event: string, ...args: any[]) {
      const handlers = this.#listeners.get(event);
      for (const handler of handlers || []) {
        handler(...args);
      }
    }

    async close() {
      bullmqState.unregister(this.name, this.#processor);
    }
  }

  return { Queue, Worker };
});

vi.mock("ioredis", () => ({
  default: class MockIORedis {
    closed = false;
    readonly options: Record<string, unknown>;
    readonly url: string;

    constructor(url: string, options: Record<string, unknown>) {
      this.url = url;
      this.options = options;
      redisState.instances.push(this);
    }

    async quit() {
      this.closed = true;
    }
  },
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";
const TEST_ENV_KEYS = [
  "INTERNAL_API_KEY",
  "INTERNAL_API_URL",
  "QSTASH_TOKEN",
  "QUEUE_BACKEND",
  "REDIS_URL",
  "VERCEL",
  "WORKER_QUEUES",
] as const;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Worker queue integration",
  { timeout: 30_000 },
  () => {
    let runtime: { close: () => Promise<void> } | undefined;
    let server: Server | undefined;
    let capturedRequests: CapturedRequest[] = [];
    let envSnapshot = new Map<string, string | undefined>();

    beforeEach(() => {
      vi.resetModules();
      bullmqState.reset();
      redisState.reset();
      capturedRequests = [];
      runtime = undefined;
      server = undefined;
      envSnapshot = snapshotEnv(TEST_ENV_KEYS);
    });

    afterEach(async () => {
      await runtime?.close();
      await closeServer(server);
      restoreEnv(envSnapshot);
    });

    it("forwards BullMQ jobs to the internal API", async () => {
      const serverInfo = await startTestServer(capturedRequests);
      server = serverInfo.server;
      setWorkerTestEnv(serverInfo.port);

      const { startWorkerRuntime } = await import(
        "../../../worker/src/runtime.mjs"
      );
      runtime = await startWorkerRuntime();

      const { enqueueBackgroundJob } = await import("@/utils/queue/dispatch");

      const result = await enqueueBackgroundJob({
        topic: "automation-jobs",
        body: { emailAccountId: "account-1" },
        qstash: {
          queueName: "automation-jobs",
          parallelism: 3,
          path: "/api/internal/worker-smoke",
          headers: {
            "x-custom-header": "queue-test",
          },
        },
        logger: createTestLogger(),
      });

      expect(result).toBe("bullmq");
      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]).toMatchObject({
        body: { emailAccountId: "account-1" },
        method: "POST",
        url: "/api/internal/worker-smoke",
      });
      expect(capturedRequests[0].headers["x-api-key"]).toBe("worker-test-key");
      expect(capturedRequests[0].headers["x-custom-header"]).toBe("queue-test");
    });

    it("processes digest jobs with the default worker queues", async () => {
      const serverInfo = await startTestServer(capturedRequests);
      server = serverInfo.server;
      setWorkerTestEnv(serverInfo.port);

      const { startWorkerRuntime } = await import(
        "../../../worker/src/runtime.mjs"
      );
      runtime = await startWorkerRuntime();

      const { enqueueBackgroundJob } = await import("@/utils/queue/dispatch");

      await enqueueBackgroundJob({
        topic: "ai-digest",
        body: { emailAccountId: "account-2", message: { id: "msg-1" } },
        qstash: {
          queueName: "digest-item-summarize",
          parallelism: 3,
          path: "/api/ai/digest",
        },
        logger: createTestLogger(),
      });

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]).toMatchObject({
        body: { emailAccountId: "account-2", message: { id: "msg-1" } },
        method: "POST",
        url: "/api/ai/digest",
      });
    });

    it("honors custom worker queue configuration", async () => {
      const serverInfo = await startTestServer(capturedRequests);
      server = serverInfo.server;
      setWorkerTestEnv(serverInfo.port, {
        workerQueues: "custom-queue:2",
      });

      const { startWorkerRuntime } = await import(
        "../../../worker/src/runtime.mjs"
      );
      runtime = await startWorkerRuntime();

      const { enqueueBackgroundJob } = await import("@/utils/queue/dispatch");

      await enqueueBackgroundJob({
        topic: "custom-queue",
        body: { job: "custom" },
        qstash: {
          queueName: "custom-queue",
          parallelism: 1,
          path: "/api/internal/custom-queue",
        },
        logger: createTestLogger(),
      });

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]).toMatchObject({
        body: { job: "custom" },
        method: "POST",
        url: "/api/internal/custom-queue",
      });
    });
  },
);

type CapturedRequest = {
  body: unknown;
  headers: Record<string, string | undefined>;
  method?: string;
  url?: string;
};

async function startTestServer(capturedRequests: CapturedRequest[]) {
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    capturedRequests.push({
      body: body ? JSON.parse(body) : undefined,
      headers: {
        "x-api-key": request.headers["x-api-key"] as string | undefined,
        "x-custom-header": request.headers["x-custom-header"] as
          | string
          | undefined,
      },
      method: request.method,
      url: request.url,
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    port: (server.address() as AddressInfo).port,
    server,
  };
}

async function closeServer(server?: Server) {
  if (!server?.listening) return;

  server.close();
  await once(server, "close");
}

function setWorkerTestEnv(
  port: number,
  options?: {
    workerQueues?: string;
  },
) {
  process.env.INTERNAL_API_KEY = "worker-test-key";
  process.env.INTERNAL_API_URL = `http://127.0.0.1:${port}`;
  process.env.QSTASH_TOKEN = "";
  process.env.QUEUE_BACKEND = "bullmq";
  process.env.REDIS_URL = "redis://queue-test";
  process.env.VERCEL = "0";
  process.env.WORKER_QUEUES = options?.workerQueues || "";
}

function snapshotEnv(keys: readonly string[]) {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>) {
  for (const [key, value] of snapshot.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}
