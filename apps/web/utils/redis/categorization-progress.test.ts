import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getCategorizationProgress,
  getCategorizationStatusSnapshot,
  saveCategorizationProgress,
  saveCategorizationTotalItems,
} from "@/utils/redis/categorization-progress";

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  },
}));

describe("categorization progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("overwrites total items while preserving completed progress and startedAt", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      totalItems: 2,
      completedItems: 1,
      status: "running",
      startedAt: "2026-04-16T11:55:00.000Z",
      updatedAt: "2026-04-16T11:56:00.000Z",
    });

    await saveCategorizationTotalItems({
      emailAccountId: "account-1",
      totalItems: 4,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "categorization-progress:account-1",
      {
        totalItems: 4,
        completedItems: 1,
        status: "running",
        startedAt: "2026-04-16T11:55:00.000Z",
        updatedAt: "2026-04-16T12:00:00.000Z",
      },
      { ex: 900 },
    );
  });

  it("atomically increments progress via the Redis Lua script", async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(
      JSON.stringify({
        totalItems: 4,
        completedItems: 4,
        status: "completed",
        startedAt: "2026-04-16T11:55:00.000Z",
        updatedAt: "2026-04-16T12:00:00.000Z",
      }),
    );

    const progress = await saveCategorizationProgress({
      emailAccountId: "account-1",
      incrementCompleted: 2,
    });

    expect(progress).toEqual({
      totalItems: 4,
      completedItems: 4,
      status: "completed",
      startedAt: "2026-04-16T11:55:00.000Z",
      updatedAt: "2026-04-16T12:00:00.000Z",
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("cjson.decode"),
      ["categorization-progress:account-1"],
      ["2", "2026-04-16T12:00:00.000Z", "900"],
    );
  });

  it("returns null when the Lua script reports no existing progress", async () => {
    vi.mocked(redis.eval).mockResolvedValueOnce(null);

    const progress = await saveCategorizationProgress({
      emailAccountId: "account-1",
      incrementCompleted: 1,
    });

    expect(progress).toBeNull();
  });

  it("returns null when no progress exists", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const progress = await getCategorizationProgress({
      emailAccountId: "account-1",
    });

    expect(progress).toBeNull();
  });

  it("accepts legacy progress entries without status metadata", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      totalItems: 4,
      completedItems: 4,
    });

    const progress = await getCategorizationProgress({
      emailAccountId: "account-1",
    });

    expect(progress).toEqual({
      totalItems: 4,
      completedItems: 4,
      status: "completed",
      startedAt: "2026-04-16T12:00:00.000Z",
      updatedAt: "2026-04-16T12:00:00.000Z",
    });
  });

  it("does not lose increments under concurrent writes", async () => {
    let stored: {
      totalItems: number;
      completedItems: number;
      status: "running" | "completed";
      startedAt: string;
      updatedAt: string;
    } | null = {
      totalItems: 100,
      completedItems: 40,
      status: "running",
      startedAt: "2026-04-16T11:55:00.000Z",
      updatedAt: "2026-04-16T11:59:00.000Z",
    };

    vi.mocked(redis.get).mockImplementation(async () =>
      stored ? { ...stored } : null,
    );

    // Simulate real Redis: each eval invocation runs atomically end-to-end,
    // but concurrent invocations are serialized by the Redis server.
    let serial: Promise<unknown> = Promise.resolve();
    vi.mocked(redis.eval).mockImplementation(
      async (_script: string, _keys: string[], argv: string[]) => {
        const next = serial.then(async () => {
          if (!stored) return null;
          const increment = Number(argv[0]);
          const now = argv[1];
          const newCompleted = Math.min(
            stored.totalItems,
            stored.completedItems + increment,
          );
          stored = {
            ...stored,
            completedItems: newCompleted,
            status: newCompleted >= stored.totalItems ? "completed" : "running",
            updatedAt: now,
          };
          return JSON.stringify(stored);
        });
        serial = next;
        return next as Promise<string | null>;
      },
    );

    await Promise.all([
      saveCategorizationProgress({
        emailAccountId: "account-1",
        incrementCompleted: 50,
      }),
      saveCategorizationProgress({
        emailAccountId: "account-1",
        incrementCompleted: 50,
      }),
      saveCategorizationProgress({
        emailAccountId: "account-1",
        incrementCompleted: 10,
      }),
    ]);

    expect(stored).not.toBeNull();
    expect(stored?.completedItems).toBe(100);
    expect(stored?.status).toBe("completed");
  });

  it("returns an idle snapshot when no progress exists", () => {
    expect(getCategorizationStatusSnapshot(null)).toEqual({
      status: "idle",
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      message: "Sender categorization has not started.",
    });
  });
});
