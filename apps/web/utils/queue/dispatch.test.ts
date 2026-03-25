import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSend = vi.fn();
const mockPublishToQstashQueue = vi.fn();
const mockEnqueueBullmqHttpJob = vi.fn();
const mockIsVercelQueueDispatchEnabled = vi.fn();

async function loadDispatchModule({
  queueBackend,
  qstashToken,
  redisUrl,
}: {
  queueBackend?: "bullmq" | "internal" | "qstash";
  qstashToken?: string;
  redisUrl?: string;
}) {
  vi.resetModules();
  vi.clearAllMocks();

  vi.doMock("@vercel/queue", () => ({
    send: mockSend,
  }));

  vi.doMock("@/env", () => ({
    env: {
      QUEUE_BACKEND: queueBackend,
      QSTASH_TOKEN: qstashToken,
      REDIS_URL: redisUrl,
    },
  }));

  vi.doMock("@/utils/upstash", () => ({
    publishToQstashQueue: mockPublishToQstashQueue,
  }));

  vi.doMock("@/utils/queue/bullmq", () => ({
    enqueueBullmqHttpJob: mockEnqueueBullmqHttpJob,
  }));

  vi.doMock("@/utils/queue/vercel", () => ({
    isVercelQueueDispatchEnabled: mockIsVercelQueueDispatchEnabled,
  }));

  return import("./dispatch");
}

describe("enqueueBackgroundJob", () => {
  beforeEach(() => {
    mockIsVercelQueueDispatchEnabled.mockReturnValue(false);
  });

  it("uses BullMQ when configured", async () => {
    const { enqueueBackgroundJob } = await loadDispatchModule({
      queueBackend: "bullmq",
      redisUrl: "redis://localhost:6379",
    });

    const result = await enqueueBackgroundJob({
      topic: "topic",
      body: { id: "job-1" },
      qstash: {
        queueName: "automation-jobs",
        parallelism: 3,
        path: "/api/automation-jobs/execute",
      },
    });

    expect(result).toBe("bullmq");
    expect(mockEnqueueBullmqHttpJob).toHaveBeenCalledWith({
      queueName: "automation-jobs",
      path: "/api/automation-jobs/execute",
      body: { id: "job-1" },
      headers: undefined,
    });
    expect(mockPublishToQstashQueue).not.toHaveBeenCalled();
  });

  it("falls back to QStash when BullMQ is selected without Redis", async () => {
    const logger = { warn: vi.fn() };
    const { enqueueBackgroundJob } = await loadDispatchModule({
      queueBackend: "bullmq",
      qstashToken: "qstash-token",
      redisUrl: undefined,
    });

    mockPublishToQstashQueue.mockResolvedValue(undefined);

    const result = await enqueueBackgroundJob({
      topic: "topic",
      body: { id: "job-2" },
      qstash: {
        queueName: "automation-jobs",
        parallelism: 3,
        path: "/api/automation-jobs/execute",
      },
      logger: logger as any,
    });

    expect(result).toBe("qstash");
    expect(logger.warn).toHaveBeenCalled();
    expect(mockPublishToQstashQueue).toHaveBeenCalled();
  });

  it("keeps the existing QStash path when configured", async () => {
    const { enqueueBackgroundJob } = await loadDispatchModule({
      queueBackend: "qstash",
      qstashToken: "qstash-token",
    });

    mockPublishToQstashQueue.mockResolvedValue(undefined);

    const result = await enqueueBackgroundJob({
      topic: "topic",
      body: { id: "job-3" },
      qstash: {
        queueName: "email-digest-all",
        parallelism: 3,
        path: "/api/resend/digest",
      },
    });

    expect(result).toBe("qstash");
    expect(mockPublishToQstashQueue).toHaveBeenCalledWith({
      queueName: "email-digest-all",
      parallelism: 3,
      path: "/api/resend/digest",
      body: { id: "job-3" },
      headers: undefined,
    });
    expect(mockEnqueueBullmqHttpJob).not.toHaveBeenCalled();
  });
});
