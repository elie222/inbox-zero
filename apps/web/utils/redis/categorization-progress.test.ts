import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getCategorizationProgress,
  saveCategorizationProgress,
  saveCategorizationTotalItems,
} from "@/utils/redis/categorization-progress";

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

describe("categorization progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("overwrites total items while preserving completed progress", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      totalItems: 2,
      completedItems: 1,
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
      },
      { ex: 120 },
    );
  });

  it("increments completed items from stored progress", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      totalItems: 4,
      completedItems: 1,
    });

    const progress = await saveCategorizationProgress({
      emailAccountId: "account-1",
      incrementCompleted: 2,
    });

    expect(progress).toEqual({
      totalItems: 4,
      completedItems: 3,
    });
    expect(redis.set).toHaveBeenCalledWith(
      "categorization-progress:account-1",
      {
        totalItems: 4,
        completedItems: 3,
      },
      { ex: 120 },
    );
  });

  it("returns null when no progress exists", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const progress = await getCategorizationProgress({
      emailAccountId: "account-1",
    });

    expect(progress).toBeNull();
  });
});
