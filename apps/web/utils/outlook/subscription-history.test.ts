import { describe, it, expect, vi } from "vitest";
import {
  parseSubscriptionHistory,
  createHistoryEntry,
  cleanupOldHistoryEntries,
  isSubscriptionInHistory,
  addCurrentSubscriptionToHistory,
} from "./subscription-history";

describe("subscription-history", () => {
  describe("parseSubscriptionHistory", () => {
    it("should parse valid subscription history", () => {
      const history = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: "2024-01-05T00:00:00Z",
        },
        {
          subscriptionId: "sub-2",
          createdAt: "2024-01-05T00:00:00Z",
          replacedAt: "2024-01-10T00:00:00Z",
        },
      ];

      const result = parseSubscriptionHistory(history);

      expect(result).toEqual(history);
    });

    it("should return empty array for null/undefined", () => {
      expect(parseSubscriptionHistory(null)).toEqual([]);
      expect(parseSubscriptionHistory(undefined)).toEqual([]);
    });

    it("should filter out invalid entries", () => {
      const logger = { warn: vi.fn() } as any;
      const history = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: "2024-01-05T00:00:00Z",
        },
        { subscriptionId: "sub-2" }, // missing fields
        "invalid", // not an object
      ];

      const result = parseSubscriptionHistory(history, logger);

      expect(result).toHaveLength(1);
      expect(result[0].subscriptionId).toBe("sub-1");
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it("should handle non-array input", () => {
      const result = parseSubscriptionHistory({ not: "an array" });
      expect(result).toEqual([]);
    });
  });

  describe("createHistoryEntry", () => {
    it("should create a valid history entry", () => {
      const entry = createHistoryEntry(
        "sub-123",
        "2024-01-01T00:00:00Z",
        "2024-01-05T00:00:00Z",
      );

      expect(entry).toEqual({
        subscriptionId: "sub-123",
        createdAt: "2024-01-01T00:00:00Z",
        replacedAt: "2024-01-05T00:00:00Z",
      });
    });
  });

  describe("cleanupOldHistoryEntries", () => {
    it("should remove entries older than specified days", () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      const history = [
        {
          subscriptionId: "very-old",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: fortyDaysAgo.toISOString(),
        },
        {
          subscriptionId: "old",
          createdAt: "2024-01-10T00:00:00Z",
          replacedAt: twentyDaysAgo.toISOString(),
        },
        {
          subscriptionId: "recent",
          createdAt: "2024-01-20T00:00:00Z",
          replacedAt: tenDaysAgo.toISOString(),
        },
      ];

      const result = cleanupOldHistoryEntries(history, 30);

      expect(result).toHaveLength(2);
      expect(result[0].subscriptionId).toBe("old");
      expect(result[1].subscriptionId).toBe("recent");
    });

    it("should use default 30 days when not specified", () => {
      const now = new Date();
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const history = [
        {
          subscriptionId: "old",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: fortyDaysAgo.toISOString(),
        },
        {
          subscriptionId: "recent",
          createdAt: "2024-01-10T00:00:00Z",
          replacedAt: twentyDaysAgo.toISOString(),
        },
      ];

      const result = cleanupOldHistoryEntries(history);

      expect(result).toHaveLength(1);
      expect(result[0].subscriptionId).toBe("recent");
    });

    it("should keep all entries if all are recent", () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      const history = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: fiveDaysAgo.toISOString(),
        },
      ];

      const result = cleanupOldHistoryEntries(history, 30);

      expect(result).toHaveLength(1);
    });
  });

  describe("isSubscriptionInHistory", () => {
    it("should return true if subscription ID exists in history", () => {
      const history = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: "2024-01-05T00:00:00Z",
        },
        {
          subscriptionId: "sub-2",
          createdAt: "2024-01-05T00:00:00Z",
          replacedAt: "2024-01-10T00:00:00Z",
        },
      ];

      expect(isSubscriptionInHistory("sub-1", history)).toBe(true);
      expect(isSubscriptionInHistory("sub-2", history)).toBe(true);
    });

    it("should return false if subscription ID does not exist", () => {
      const history = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: "2024-01-05T00:00:00Z",
        },
      ];

      expect(isSubscriptionInHistory("sub-999", history)).toBe(false);
    });

    it("should return false for empty history", () => {
      expect(isSubscriptionInHistory("sub-1", [])).toBe(false);
      expect(isSubscriptionInHistory("sub-1", null)).toBe(false);
    });

    it("should handle invalid history data", () => {
      expect(isSubscriptionInHistory("sub-1", "not an array")).toBe(false);
      expect(isSubscriptionInHistory("sub-1", { not: "valid" })).toBe(false);
    });
  });

  describe("addCurrentSubscriptionToHistory", () => {
    it("should add subscription to empty history", () => {
      const replacedAt = new Date("2024-01-10T00:00:00Z");
      const fallbackCreatedAt = new Date("2024-01-01T00:00:00Z");

      const result = addCurrentSubscriptionToHistory(
        null,
        "sub-123",
        replacedAt,
        fallbackCreatedAt,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        subscriptionId: "sub-123",
        createdAt: fallbackCreatedAt.toISOString(),
        replacedAt: replacedAt.toISOString(),
      });
    });

    it("should use last entry's replacedAt as createdAt for new entry", () => {
      const existingHistory = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: "2024-01-05T00:00:00Z",
        },
      ];

      const replacedAt = new Date("2024-01-10T00:00:00Z");
      const fallbackCreatedAt = new Date("2024-01-01T00:00:00Z");

      const result = addCurrentSubscriptionToHistory(
        existingHistory,
        "sub-2",
        replacedAt,
        fallbackCreatedAt,
      );

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        subscriptionId: "sub-2",
        createdAt: "2024-01-05T00:00:00Z", // from last entry's replacedAt
        replacedAt: replacedAt.toISOString(),
      });
    });

    it("should preserve existing history entries", () => {
      const existingHistory = [
        {
          subscriptionId: "sub-1",
          createdAt: "2024-01-01T00:00:00Z",
          replacedAt: "2024-01-05T00:00:00Z",
        },
        {
          subscriptionId: "sub-2",
          createdAt: "2024-01-05T00:00:00Z",
          replacedAt: "2024-01-08T00:00:00Z",
        },
      ];

      const result = addCurrentSubscriptionToHistory(
        existingHistory,
        "sub-3",
        new Date("2024-01-10T00:00:00Z"),
        new Date("2024-01-01T00:00:00Z"),
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(existingHistory[0]);
      expect(result[1]).toEqual(existingHistory[1]);
      expect(result[2].subscriptionId).toBe("sub-3");
    });
  });
});
