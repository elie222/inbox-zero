import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock BullMQ
const mockQueue = {
  add: vi.fn(),
  addBulk: vi.fn(),
  close: vi.fn(),
};

const mockWorker = {
  on: vi.fn(),
  close: vi.fn(),
  isRunning: vi.fn().mockReturnValue(true),
  opts: { concurrency: 3 },
};

const mockQueueEvents = {
  close: vi.fn(),
};

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => mockQueue),
  Worker: vi.fn().mockImplementation(() => mockWorker),
  QueueEvents: vi.fn().mockImplementation(() => mockQueueEvents),
}));

// Mock QStash Client
const mockClient = {
  publishJSON: vi.fn(),
  batchJSON: vi.fn(),
};

vi.mock("@upstash/qstash", () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

// Mock publishToQstashQueue
const mockPublishToQstashQueue = vi.fn();
vi.mock("@/utils/upstash", () => ({
  publishToQstashQueue: mockPublishToQstashQueue,
}));

// Mock environment - default to upstash
vi.mock("@/env", () => ({
  env: {
    QUEUE_SYSTEM: "upstash",
    QSTASH_TOKEN: "test-token",
    REDIS_URL: "redis://localhost:6379",
    WEBHOOK_URL: "https://test.com",
    NEXT_PUBLIC_BASE_URL: "https://test.com",
  },
}));

describe("Queue System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { closeQueueManager } = await import("./queue-manager");
    await closeQueueManager();
    vi.resetModules();
  });

  describe("Queue Manager", () => {
    describe("System Detection", () => {
      it("should detect QStash system by default", async () => {
        const { getQueueSystemInfo } = await import("./queue-manager");
        const info = getQueueSystemInfo();

        expect(info.system).toBe("upstash");
        expect(info.isQStash).toBe(true);
        expect(info.isRedis).toBe(false);
      });

      it("should detect Redis system when configured", async () => {
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "redis",
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { getQueueSystemInfo } = await import("./queue-manager");
        const info = getQueueSystemInfo();

        expect(info.system).toBe("redis");
        expect(info.isRedis).toBe(true);
        expect(info.isQStash).toBe(false);
      });
    });

    describe("Job Enqueueing", () => {
      it("should enqueue a single job with QStash", async () => {
        // Ensure we're using QStash environment
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "upstash",
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { enqueueJob } = await import("./queue-manager");
        const jobData = { message: "Test job", userId: "user-123" };

        mockPublishToQstashQueue.mockResolvedValueOnce({
          messageId: "qstash-message-123",
        });

        const result = await enqueueJob("test-queue", jobData);

        expect(mockPublishToQstashQueue).toHaveBeenCalledWith({
          queueName: "test-queue",
          parallelism: 3,
          url: "https://test.com/api/queue/test-queue",
          body: jobData,
        });
        expect(result).toBe("qstash-message-123");
      });

      it("should enqueue a job with options", async () => {
        // Ensure we're using QStash environment
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "upstash",
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { enqueueJob } = await import("./queue-manager");
        const jobData = { message: "Delayed job", userId: "user-456" };
        const options = { delay: 5000, priority: 1, jobId: "custom-job-id" };

        mockClient.publishJSON.mockResolvedValueOnce({
          messageId: "qstash-delayed-123",
        });

        const result = await enqueueJob("test-queue", jobData, options);

        expect(mockClient.publishJSON).toHaveBeenCalledWith({
          url: "https://test.com/api/queue/test-queue",
          body: jobData,
          notBefore: expect.any(Number),
          deduplicationId: "custom-job-id",
        });
        expect(result).toBe("qstash-delayed-123");
      });

      it("should handle job enqueueing errors", async () => {
        // Ensure we're using QStash environment
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "upstash",
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { enqueueJob } = await import("./queue-manager");
        const error = new Error("Enqueue failed");
        mockPublishToQstashQueue.mockRejectedValueOnce(error);

        await expect(
          enqueueJob("test-queue", { message: "Test" }),
        ).rejects.toThrow("Enqueue failed");
      });
    });

    describe("Bulk Job Enqueueing", () => {
      it("should enqueue multiple jobs", async () => {
        // Ensure we're using QStash environment
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "upstash",
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { bulkEnqueueJobs } = await import("./queue-manager");
        const jobs = [
          { data: { message: "Bulk job 1" } },
          { data: { message: "Bulk job 2" } },
        ];

        mockClient.batchJSON.mockResolvedValueOnce([
          { messageId: "qstash-bulk-1" },
          { messageId: "qstash-bulk-2" },
        ]);

        const result = await bulkEnqueueJobs("test-queue", { jobs });

        expect(mockClient.batchJSON).toHaveBeenCalledWith([
          {
            url: "https://test.com/api/queue/test-queue",
            body: { message: "Bulk job 1" },
          },
          {
            url: "https://test.com/api/queue/test-queue",
            body: { message: "Bulk job 2" },
          },
        ]);
        expect(result).toEqual(["qstash-bulk-1", "qstash-bulk-2"]);
      });

      it("should handle bulk enqueueing errors", async () => {
        // Ensure we're using QStash environment
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "upstash",
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { bulkEnqueueJobs } = await import("./queue-manager");
        const error = new Error("Bulk enqueue failed");
        mockClient.batchJSON.mockRejectedValueOnce(error);

        await expect(
          bulkEnqueueJobs("test-queue", {
            jobs: [{ data: { message: "Test" } }],
          }),
        ).rejects.toThrow("Bulk enqueue failed");
      });
    });

    describe("Error Handling", () => {
      it("should handle unsupported queue system", async () => {
        await vi.doMock("@/env", () => ({
          env: {
            QUEUE_SYSTEM: "unsupported" as any,
            QSTASH_TOKEN: "test-token",
            REDIS_URL: "redis://localhost:6379",
            WEBHOOK_URL: "https://test.com",
            NEXT_PUBLIC_BASE_URL: "https://test.com",
          },
        }));
        vi.resetModules();

        const { createQueueManager } = await import("./queue-manager");
        expect(() => createQueueManager()).toThrow(
          "Unsupported queue system: unsupported",
        );
      });
    });
  });

  describe("BullMQ Manager", () => {
    let manager: any;

    beforeEach(async () => {
      await vi.doMock("@/env", () => ({
        env: {
          QUEUE_SYSTEM: "redis",
          QSTASH_TOKEN: "test-token",
          REDIS_URL: "redis://localhost:6379",
          WEBHOOK_URL: "https://test.com",
          NEXT_PUBLIC_BASE_URL: "https://test.com",
        },
      }));
      vi.resetModules();

      const { BullMQManager } = await import("./bullmq-manager");
      manager = new BullMQManager();
    });

    afterEach(async () => {
      if (manager) {
        await manager.close();
      }
    });

    describe("Job Enqueueing", () => {
      it("should enqueue a single job", async () => {
        const jobData = { message: "Test job", userId: "user-123" };
        mockQueue.add.mockResolvedValueOnce({ id: "job-123" });

        const result = await manager.enqueue("test-queue", jobData);

        expect(mockQueue.add).toHaveBeenCalledWith("test-queue", jobData, {
          delay: undefined,
          attempts: 5,
          priority: undefined,
          removeOnComplete: 10,
          removeOnFail: 5,
          jobId: undefined,
        });
        expect(result).toEqual({ id: "job-123" });
      });

      it("should enqueue a job with options", async () => {
        const jobData = { message: "Delayed job", userId: "user-456" };
        const options = { delay: 5000, priority: 1, jobId: "job-456" };
        mockQueue.add.mockResolvedValueOnce({ id: "job-456" });

        const result = await manager.enqueue("test-queue", jobData, options);

        expect(mockQueue.add).toHaveBeenCalledWith("test-queue", jobData, {
          delay: 5000,
          attempts: 5,
          priority: 1,
          removeOnComplete: 10,
          removeOnFail: 5,
          jobId: "job-456",
        });
        expect(result).toEqual({ id: "job-456" });
      });

      it("should handle enqueue errors", async () => {
        const error = new Error("Enqueue failed");
        mockQueue.add.mockRejectedValueOnce(error);

        await expect(
          manager.enqueue("test-queue", { message: "Test" }),
        ).rejects.toThrow("Enqueue failed");
      });
    });

    describe("Bulk Job Enqueueing", () => {
      it("should enqueue multiple jobs", async () => {
        const jobs = [
          { data: { message: "Bulk job 1" } },
          { data: { message: "Bulk job 2" } },
        ];
        const mockJobs = [{ id: "bulk-job-1" }, { id: "bulk-job-2" }];
        mockQueue.addBulk.mockResolvedValueOnce(mockJobs);

        const result = await manager.bulkEnqueue("test-queue", { jobs });

        expect(mockQueue.addBulk).toHaveBeenCalledWith([
          {
            name: "test-queue",
            data: { message: "Bulk job 1" },
            opts: {
              delay: undefined,
              attempts: 5,
              priority: undefined,
              removeOnComplete: 10,
              removeOnFail: 5,
              jobId: undefined,
            },
          },
          {
            name: "test-queue",
            data: { message: "Bulk job 2" },
            opts: {
              delay: undefined,
              attempts: 5,
              priority: undefined,
              removeOnComplete: 10,
              removeOnFail: 5,
              jobId: undefined,
            },
          },
        ]);
        expect(result).toBe(mockJobs);
      });
    });

    describe("Worker Management", () => {
      it("should create a worker", () => {
        const processor = vi.fn();
        const worker = manager.createWorker("test-queue", processor);

        expect(worker).toBe(mockWorker);
      });

      it("should create a worker with concurrency", () => {
        const processor = vi.fn();
        const worker = manager.createWorker("test-queue", processor, {
          concurrency: 5,
        });

        expect(worker).toBe(mockWorker);
      });
    });

    describe("Queue Management", () => {
      it("should create a queue", () => {
        const queue = manager.createQueue("test-queue");
        expect(queue).toBe(mockQueue);
      });

      it("should get queue events", () => {
        const events = manager.getQueueEvents("test-queue");
        expect(events).toBe(mockQueueEvents);
      });
    });

    describe("Cleanup", () => {
      it("should close all workers and queues", async () => {
        manager.createWorker("test-queue-1", vi.fn());
        manager.createWorker("test-queue-2", vi.fn());
        manager.createQueue("test-queue-1");
        manager.createQueue("test-queue-2");
        manager.getQueueEvents("test-queue-1");
        manager.getQueueEvents("test-queue-2");

        await manager.close();

        expect(mockWorker.close).toHaveBeenCalledTimes(2);
        expect(mockQueue.close).toHaveBeenCalledTimes(2);
        expect(mockQueueEvents.close).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("QStash Manager", () => {
    let manager: any;

    beforeEach(async () => {
      const { QStashManager } = await import("./qstash-manager");
      manager = new QStashManager();
    });

    afterEach(async () => {
      if (manager) {
        await manager.close();
      }
    });

    describe("Job Enqueueing", () => {
      it("should enqueue a single job", async () => {
        const jobData = { message: "Test job", userId: "user-123" };
        mockPublishToQstashQueue.mockResolvedValueOnce({
          messageId: "qstash-message-123",
        });

        const result = await manager.enqueue("test-queue", jobData);

        expect(mockPublishToQstashQueue).toHaveBeenCalledWith({
          queueName: "test-queue",
          parallelism: 3,
          url: "https://test.com/api/queue/test-queue",
          body: jobData,
        });
        expect(result).toBe("qstash-message-123");
      });

      it("should enqueue a job with delay", async () => {
        const jobData = { message: "Delayed job", userId: "user-456" };
        const options = { delay: 5000, jobId: "delayed-job-123" };
        mockClient.publishJSON.mockResolvedValueOnce({
          messageId: "qstash-delayed-123",
        });

        const result = await manager.enqueue("test-queue", jobData, options);

        expect(mockClient.publishJSON).toHaveBeenCalledWith({
          url: "https://test.com/api/queue/test-queue",
          body: jobData,
          notBefore: expect.any(Number),
          deduplicationId: "delayed-job-123",
        });
        expect(result).toBe("qstash-delayed-123");
      });

      it("should handle enqueue errors", async () => {
        const error = new Error("Enqueue failed");
        mockPublishToQstashQueue.mockRejectedValueOnce(error);

        await expect(
          manager.enqueue("test-queue", { message: "Test" }),
        ).rejects.toThrow("Enqueue failed");
      });

      it("should return 'unknown' when messageId is missing", async () => {
        mockPublishToQstashQueue.mockResolvedValueOnce({
          messageId: undefined,
        }); // No messageId

        const result = await manager.enqueue("test-queue", { message: "Test" });
        expect(result).toBe("unknown");
      });
    });

    describe("Bulk Job Enqueueing", () => {
      it("should enqueue multiple jobs", async () => {
        const jobs = [
          { data: { message: "Bulk job 1" } },
          { data: { message: "Bulk job 2" } },
        ];
        mockClient.batchJSON.mockResolvedValueOnce([
          { messageId: "qstash-bulk-1" },
          { messageId: "qstash-bulk-2" },
        ]);

        const result = await manager.bulkEnqueue("test-queue", { jobs });

        expect(mockClient.batchJSON).toHaveBeenCalledWith([
          {
            url: "https://test.com/api/queue/test-queue",
            body: { message: "Bulk job 1" },
          },
          {
            url: "https://test.com/api/queue/test-queue",
            body: { message: "Bulk job 2" },
          },
        ]);
        expect(result).toEqual(["qstash-bulk-1", "qstash-bulk-2"]);
      });

      it("should handle bulk enqueue errors", async () => {
        const error = new Error("Bulk enqueue failed");
        mockClient.batchJSON.mockRejectedValueOnce(error);

        await expect(
          manager.bulkEnqueue("test-queue", {
            jobs: [{ data: { message: "Test" } }],
          }),
        ).rejects.toThrow("Bulk enqueue failed");
      });
    });

    describe("Unsupported Operations", () => {
      it("should throw error for createWorker", () => {
        expect(() => manager.createWorker("test-queue", vi.fn())).toThrow(
          "QStash workers are handled via HTTP endpoints, not BullMQ workers",
        );
      });

      it("should throw error for createQueue", () => {
        expect(() => manager.createQueue("test-queue")).toThrow(
          "QStash queues are managed by QStash, not BullMQ",
        );
      });

      it("should throw error for getQueueEvents", () => {
        expect(() => manager.getQueueEvents("test-queue")).toThrow(
          "QStash queue events are not available through BullMQ",
        );
      });
    });

    describe("URL Construction", () => {
      it("should use WEBHOOK_URL when available", async () => {
        await vi.doMock("@/env", () => ({
          env: {
            QSTASH_TOKEN: "test-token",
            WEBHOOK_URL: "https://webhook.test.com",
            NEXT_PUBLIC_BASE_URL: "https://fallback.test.com",
          },
        }));
        vi.resetModules();

        const { QStashManager: MockedQStashManager } = await import(
          "./qstash-manager"
        );
        const mockedManager = new MockedQStashManager();

        mockPublishToQstashQueue.mockResolvedValue({ messageId: "test-123" });

        await mockedManager.enqueue("test-queue", { message: "Test" });

        expect(mockPublishToQstashQueue).toHaveBeenCalledWith(
          expect.objectContaining({
            url: "https://webhook.test.com/api/queue/test-queue",
          }),
        );
      });

      it("should fallback to NEXT_PUBLIC_BASE_URL when WEBHOOK_URL is not available", async () => {
        await vi.doMock("@/env", () => ({
          env: {
            QSTASH_TOKEN: "test-token",
            WEBHOOK_URL: undefined,
            NEXT_PUBLIC_BASE_URL: "https://fallback.test.com",
          },
        }));
        vi.resetModules();

        const { QStashManager: MockedQStashManager } = await import(
          "./qstash-manager"
        );
        const mockedManager = new MockedQStashManager();

        mockPublishToQstashQueue.mockResolvedValue({ messageId: "test-123" });

        await mockedManager.enqueue("test-queue", { message: "Test" });

        expect(mockPublishToQstashQueue).toHaveBeenCalledWith(
          expect.objectContaining({
            url: "https://fallback.test.com/api/queue/test-queue",
          }),
        );
      });
    });
  });

  describe("Worker Management", () => {
    const mockCreateQueueWorker = vi.fn();
    const mockCloseQueueManager = vi.fn();

    beforeEach(() => {
      vi.doMock("./queue-manager", () => ({
        createQueueWorker: mockCreateQueueWorker,
        closeQueueManager: mockCloseQueueManager,
      }));
    });

    describe("Worker Registration", () => {
      it("should register a worker", async () => {
        const { registerWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);

        const worker = registerWorker("test-queue", processor);

        expect(mockCreateQueueWorker).toHaveBeenCalledWith(
          "test-queue",
          processor,
          {
            concurrency: 3,
          },
        );
        expect(worker).toBe(mockWorker);
      });

      it("should register a worker with configuration", async () => {
        const { registerWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);

        registerWorker("test-queue", processor, { concurrency: 5 });

        expect(mockCreateQueueWorker).toHaveBeenCalledWith(
          "test-queue",
          processor,
          {
            concurrency: 5,
          },
        );
      });

      it("should return existing worker if already registered", async () => {
        const { registerWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);
        registerWorker("test-queue", processor);
        const worker = registerWorker("test-queue", vi.fn()); // Try to register again

        expect(mockCreateQueueWorker).toHaveBeenCalledTimes(1); // Should only be called once
        expect(worker).toBe(mockWorker);
      });

      it("should handle worker creation failure", async () => {
        const { registerWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(null);

        const worker = registerWorker("test-queue", processor);

        expect(worker).toBeNull();
      });
    });

    describe("Worker Events", () => {
      it("should set up worker event listeners", async () => {
        const { registerWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);
        registerWorker("test-queue", processor);

        expect(mockWorker.on).toHaveBeenCalledWith(
          "completed",
          expect.any(Function),
        );
        expect(mockWorker.on).toHaveBeenCalledWith(
          "failed",
          expect.any(Function),
        );
        expect(mockWorker.on).toHaveBeenCalledWith(
          "stalled",
          expect.any(Function),
        );
        expect(mockWorker.on).toHaveBeenCalledWith(
          "error",
          expect.any(Function),
        );
      });
    });

    describe("Worker Management", () => {
      it("should unregister a worker", async () => {
        const { registerWorker, unregisterWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);
        registerWorker("test-queue", processor);

        await unregisterWorker("test-queue");

        expect(mockWorker.close).toHaveBeenCalledTimes(1);
      });

      it("should handle unregistering non-existent worker", async () => {
        const { unregisterWorker } = await import("./worker");

        await unregisterWorker("non-existent-queue");
        expect(mockWorker.close).not.toHaveBeenCalled();
      });

      it("should get a specific worker", async () => {
        const { registerWorker, getWorker } = await import("./worker");
        const processor = vi.fn();

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);
        registerWorker("test-queue", processor);

        const worker = getWorker("test-queue");
        expect(worker).toBe(mockWorker);
      });

      it("should return undefined for non-existent worker", async () => {
        const { getWorker } = await import("./worker");

        const worker = getWorker("non-existent-queue");
        expect(worker).toBeUndefined();
      });
    });

    describe("Shutdown", () => {
      it("should shutdown all workers", async () => {
        const { registerWorker, shutdownAllWorkers } = await import("./worker");

        mockCreateQueueWorker.mockReturnValue(mockWorker);
        registerWorker("test-queue-1", vi.fn());
        registerWorker("test-queue-2", vi.fn());

        await shutdownAllWorkers();

        expect(mockWorker.close).toHaveBeenCalledTimes(2);
      });

      it("should handle shutdown errors gracefully", async () => {
        const { registerWorker, shutdownAllWorkers } = await import("./worker");

        mockCreateQueueWorker.mockReturnValueOnce(mockWorker);
        registerWorker("test-queue", vi.fn());
        mockWorker.close.mockRejectedValueOnce(new Error("Close failed"));

        await shutdownAllWorkers();

        expect(mockWorker.close).toHaveBeenCalledTimes(1);
      });
    });
  });
});
