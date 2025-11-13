import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";

// Mock server-only to prevent import errors in tests
vi.mock("server-only", () => ({}));

// Mock fetch for HTTP worker (Redis) path
const originalFetch = global.fetch;
const mockFetch = vi.fn();
// @ts-expect-error override for tests
global.fetch = mockFetch;

// Helper to create env mock
const createEnvMock = (overrides: Record<string, unknown> = {}) => ({
  env: {
    QUEUE_SYSTEM: "redis",
    WORKER_BASE_URL: "http://queue-worker:5070",
    CRON_SECRET: "test-cron",
    NODE_ENV: "test",
    EMAIL_ENCRYPT_SECRET: "test-encryption-secret-key-for-testing-purposes",
    EMAIL_ENCRYPT_SALT: "test-encryption-salt-for-testing",
    ...overrides,
  },
});

describe("HTTP Worker Manager (Redis)", () => {
  let manager: any;

  beforeEach(async () => {
    await vi.doMock("@/env", () => createEnvMock());
    vi.resetModules();
    mockFetch.mockReset();
    const { BullMQManager } = await import("./bullmq-manager");
    manager = new BullMQManager();
  });

  afterEach(async () => {
    if (manager) {
      await manager.close();
    }
  });

  describe("Job Enqueueing (HTTP)", () => {
    it("should enqueue a single job via worker service", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: "job-123" }), { status: 200 }),
      );
      const jobData = { message: "Test job", userId: "user-123" };

      const result = await manager.enqueue("test-queue", jobData);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://queue-worker:5070/v1/jobs",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "content-type": "application/json",
            authorization: "Bearer test-cron",
          }),
        }),
      );
      expect(result).toBe("job-123");
    });

    it("should enqueue a job with options", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: "job-456" }), { status: 200 }),
      );
      const jobData = { message: "Delayed job", userId: "user-456" };
      const options = {
        notBefore: Math.ceil((Date.now() + 5000) / 1000),
        deduplicationId: "job-456",
      };

      const result = await manager.enqueue("test-queue", jobData, options);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.options).toEqual(
        expect.objectContaining({
          notBefore: expect.any(Number),
          deduplicationId: "job-456",
        }),
      );
      expect(result).toBe("job-456");
    });

    it("should handle enqueue errors", async () => {
      mockFetch.mockResolvedValueOnce(new Response("oops", { status: 500 }));
      await expect(
        manager.enqueue("test-queue", { message: "Test" }),
      ).rejects.toThrow("Worker enqueue failed (500): ");
    });
  });

  describe("Bulk Job Enqueueing (HTTP)", () => {
    it("should enqueue multiple jobs via worker service", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ jobIds: ["bulk-1", "bulk-2"] }), {
          status: 200,
        }),
      );
      const jobs = [
        { data: { message: "Bulk job 1" } },
        { data: { message: "Bulk job 2" } },
      ];

      const result = await manager.bulkEnqueue("test-queue", { jobs });

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.items).toHaveLength(2);
      expect(result).toEqual(["bulk-1", "bulk-2"]);
    });
  });
});

// Restore fetch after all tests in this file
afterAll(() => {
  // @ts-expect-error restore
  global.fetch = originalFetch;
});
