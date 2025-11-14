import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock server-only to prevent import errors in tests
vi.mock("server-only", () => ({}));

const createEnvMock = (overrides: Record<string, unknown> = {}) => ({
  env: {
    QUEUE_SYSTEM: "upstash",
    QSTASH_TOKEN: "test-token",
    REDIS_URL: "redis://localhost:6379",
    WEBHOOK_URL: "https://test.com",
    NEXT_PUBLIC_BASE_URL: "https://test.com",
    EMAIL_ENCRYPT_SECRET: "test-encryption-secret-key-for-testing-purposes",
    EMAIL_ENCRYPT_SALT: "test-encryption-salt-for-testing",
    NODE_ENV: "test",
    ...overrides,
  },
});

describe("Queue Manager - System Detection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const { closeQueueManager } = await import("./queue-manager");
    await closeQueueManager();
  });

  it("should detect QStash system by default", async () => {
    await vi.doMock("@/env", () => createEnvMock());
    vi.resetModules();
    const { getQueueSystemInfo } = await import("./queue-manager");
    const info = getQueueSystemInfo();
    expect(info.system).toBe("upstash");
    expect(info.supportsWorkers).toBe(false);
    expect(info.supportsDelayedJobs).toBe(true);
    expect(info.supportsBulkOperations).toBe(true);
  });

  it("should detect Redis system when configured", async () => {
    await vi.doMock("@/env", () =>
      createEnvMock({
        QUEUE_SYSTEM: "redis",
        WORKER_BASE_URL: "http://queue-worker:5070",
        CRON_SECRET: "test-cron",
      }),
    );
    vi.resetModules();
    const { getQueueSystemInfo } = await import("./queue-manager");
    const info = getQueueSystemInfo();
    expect(info.system).toBe("redis");
    expect(info.supportsWorkers).toBe(true);
    expect(info.supportsDelayedJobs).toBe(true);
    expect(info.supportsBulkOperations).toBe(true);
  });
});
