import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getBulkArchiveProgress,
  saveBulkArchiveProgress,
  saveBulkArchiveTotalItems,
} from "@/utils/redis/bulk-archive-progress";

vi.mock("@/utils/redis", () => ({
  redis: {
    hgetall: vi.fn(),
    hset: vi.fn(),
    hincrby: vi.fn(),
    expire: vi.fn(),
  },
}));

describe("bulk archive progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores queued sender totals for a fresh archive run", async () => {
    vi.mocked(redis.hgetall).mockResolvedValueOnce(null);

    await saveBulkArchiveTotalItems({
      emailAccountId: "account-1",
      totalItems: 3,
    });

    expect(redis.hset).toHaveBeenCalledWith("bulk-archive-progress:account-1", {
      totalItems: 3,
      completedItems: 0,
    });
    expect(redis.expire).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      300,
    );
  });

  it("resets completed progress when a new run starts", async () => {
    vi.mocked(redis.hgetall).mockResolvedValueOnce({
      totalItems: 2,
      completedItems: 2,
    });

    await saveBulkArchiveTotalItems({
      emailAccountId: "account-1",
      totalItems: 4,
    });

    expect(redis.hset).toHaveBeenCalledWith("bulk-archive-progress:account-1", {
      totalItems: 4,
      completedItems: 0,
    });
    expect(redis.expire).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      300,
    );
  });

  it("adds totals onto an in-flight archive run", async () => {
    vi.mocked(redis.hgetall).mockResolvedValueOnce({
      totalItems: 2,
      completedItems: 1,
    });
    vi.mocked(redis.hincrby).mockResolvedValueOnce(4);

    await saveBulkArchiveTotalItems({
      emailAccountId: "account-1",
      totalItems: 2,
    });

    expect(redis.hincrby).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      "totalItems",
      2,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      300,
    );
  });

  it("increments completed items atomically and shortens ttl when progress is done", async () => {
    vi.mocked(redis.hgetall).mockResolvedValueOnce({
      totalItems: 3,
      completedItems: 2,
    });
    vi.mocked(redis.hincrby).mockResolvedValueOnce(3);

    await saveBulkArchiveProgress({
      emailAccountId: "account-1",
      incrementCompleted: 1,
    });

    expect(redis.hincrby).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      "completedItems",
      1,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      30,
    );
  });

  it("returns null when no stored progress exists", async () => {
    vi.mocked(redis.hgetall).mockResolvedValueOnce(null);

    const progress = await getBulkArchiveProgress({
      emailAccountId: "account-1",
    });

    expect(progress).toBeNull();
  });
});
