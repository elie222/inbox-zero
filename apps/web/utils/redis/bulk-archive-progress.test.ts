import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getBulkArchiveProgress,
  saveBulkArchiveProgress,
  saveBulkArchiveTotalItems,
} from "@/utils/redis/bulk-archive-progress";

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("bulk archive progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores queued sender totals for a fresh archive run", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    await saveBulkArchiveTotalItems({
      emailAccountId: "account-1",
      totalItems: 3,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      { totalItems: 3, completedItems: 0 },
      { ex: 300 },
    );
  });

  it("resets completed progress when a new run starts", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      totalItems: 2,
      completedItems: 2,
    });

    await saveBulkArchiveTotalItems({
      emailAccountId: "account-1",
      totalItems: 4,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      { totalItems: 4, completedItems: 0 },
      { ex: 300 },
    );
  });

  it("increments completed items and shortens ttl when progress is done", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      totalItems: 3,
      completedItems: 2,
    });

    await saveBulkArchiveProgress({
      emailAccountId: "account-1",
      incrementCompleted: 1,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-progress:account-1",
      { totalItems: 3, completedItems: 3 },
      { ex: 5 },
    );
  });

  it("returns null when no stored progress exists", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const progress = await getBulkArchiveProgress({
      emailAccountId: "account-1",
    });

    expect(progress).toBeNull();
  });
});
