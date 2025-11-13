import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock server-only to prevent import errors in tests
vi.mock("server-only", () => ({}));

// QStash Mocks
const q = {
  upsert: vi.fn(),
  enqueueJSON: vi.fn(),
};
const mockClient = {
  publishJSON: vi.fn(),
  batchJSON: vi.fn(),
  queue: vi.fn().mockImplementation(() => q),
};

vi.mock("@upstash/qstash", () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

// Helper to create env mock
const createEnvMock = (overrides: Record<string, unknown> = {}) => ({
  env: {
    QUEUE_SYSTEM: "upstash",
    WEBHOOK_URL: "https://webhook.test.com",
    NEXT_PUBLIC_BASE_URL: "https://fallback.test.com",
    NODE_ENV: "test",
    EMAIL_ENCRYPT_SECRET: "test-encryption-secret-key-for-testing-purposes",
    EMAIL_ENCRYPT_SALT: "test-encryption-salt-for-testing",
    QSTASH_TOKEN: "test-token",
    ...overrides,
  },
});

describe("QStash Manager", () => {
  let manager: any;

  beforeEach(async () => {
    await vi.doMock("@/env", () => createEnvMock());
    vi.resetModules();
    const { QStashManager } = await import("./qstash-manager");
    manager = new QStashManager();
  });

  afterEach(async () => {
    if (manager) {
      await manager.close();
    }
    vi.clearAllMocks();
  });

  describe("Job Enqueueing", () => {
    it("should enqueue a single job (queue.enqueueJSON path)", async () => {
      q.upsert.mockResolvedValueOnce(undefined);
      q.enqueueJSON.mockResolvedValueOnce({ messageId: "qstash-message-123" });

      const jobData = { message: "Test job", userId: "user-123" };
      const result = await manager.enqueue("test-queue", jobData);

      expect(mockClient.queue).toHaveBeenCalledWith({
        queueName: "test-queue",
      });
      expect(q.upsert).toHaveBeenCalledWith({ parallelism: 3 });
      expect(q.enqueueJSON).toHaveBeenCalledWith({
        url: "https://webhook.test.com/api/queue/test-queue",
        body: jobData,
        deduplicationId: undefined,
        headers: undefined,
      });
      expect(result).toBe("qstash-message-123");
    });

    it("should enqueue a job with notBefore (publishJSON path)", async () => {
      mockClient.publishJSON.mockResolvedValueOnce({
        messageId: "qstash-delayed-123",
      });
      const jobData = { message: "Delayed job", userId: "user-456" };
      const result = await manager.enqueue("test-queue", jobData, {
        notBefore: Math.ceil((Date.now() + 5000) / 1000),
        deduplicationId: "custom-job-id",
        headers: { "x-test": "1" },
      });

      expect(mockClient.publishJSON).toHaveBeenCalledWith({
        url: "https://webhook.test.com/api/queue/test-queue",
        body: jobData,
        notBefore: expect.any(Number),
        deduplicationId: "custom-job-id",
        headers: { "x-test": "1" },
      });
      expect(result).toBe("qstash-delayed-123");
    });

    it("should handle enqueue errors", async () => {
      mockClient.publishJSON.mockRejectedValueOnce(new Error("Enqueue failed"));
      await expect(
        manager.enqueue(
          "test-queue",
          { message: "Test" },
          { notBefore: Math.ceil((Date.now() + 1) / 1000) },
        ),
      ).rejects.toThrow("Enqueue failed");
    });

    it("should return 'unknown' when messageId is missing", async () => {
      q.upsert.mockResolvedValueOnce(undefined);
      q.enqueueJSON.mockResolvedValueOnce({ messageId: undefined });

      const result = await manager.enqueue("test-queue", { message: "Test" });
      expect(result).toBe("unknown");
    });
  });

  describe("Bulk Job Enqueueing", () => {
    it("should enqueue multiple jobs with batchJSON", async () => {
      mockClient.batchJSON.mockResolvedValueOnce([
        { messageId: "qstash-bulk-1" },
        { messageId: "qstash-bulk-2" },
      ]);

      const result = await manager.bulkEnqueue("test-queue", {
        jobs: [
          { data: { message: "Bulk job 1" } },
          { data: { message: "Bulk job 2" } },
        ],
      });

      expect(mockClient.batchJSON).toHaveBeenCalledWith([
        {
          url: "https://webhook.test.com/api/queue/test-queue",
          body: { message: "Bulk job 1" },
        },
        {
          url: "https://webhook.test.com/api/queue/test-queue",
          body: { message: "Bulk job 2" },
        },
      ]);
      expect(result).toEqual(["qstash-bulk-1", "qstash-bulk-2"]);
    });
  });
});
