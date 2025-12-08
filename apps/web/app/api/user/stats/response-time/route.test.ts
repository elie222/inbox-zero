import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateResponseTimes,
  calculateSummaryStats,
  calculateDistribution,
} from "./route";
import { createScopedLogger } from "@/utils/logger";
import { getMockMessage as getMockMessageHelper } from "../../../../../__tests__/helpers";

vi.mock("server-only", () => ({}));

const logger = createScopedLogger("test");

describe("Response Time Stats", () => {
  describe("calculateResponseTimes", () => {
    let mockEmailProvider: any;

    beforeEach(() => {
      mockEmailProvider = {
        getThreadMessages: vi.fn(),
        name: "google",
      };
    });

    it("should calculate response time for simple reply", async () => {
      const threadId = "t1";
      const sentMsg = getMockMessageHelper({ threadId, id: "s1" });

      const receivedTime = new Date("2024-01-01T10:00:00Z");
      const sentTime = new Date("2024-01-01T10:30:00Z"); // 30 mins later

      mockEmailProvider.getThreadMessages.mockResolvedValue([
        {
          ...getMockMessageHelper({
            id: "r1",
            threadId,
          }),
          internalDate: receivedTime.toISOString(),
          date: receivedTime.toISOString(),
        },
        {
          ...getMockMessageHelper({
            id: "s1",
            threadId,
          }),
          internalDate: sentTime.toISOString(),
          date: sentTime.toISOString(),
          labelIds: ["SENT"],
        },
      ]);

      const result = await calculateResponseTimes(
        [sentMsg],
        mockEmailProvider,
        logger,
      );

      expect(result.responseTimes).toHaveLength(1);
      expect(result.responseTimes[0].responseTimeMs).toBe(30 * 60 * 1000); // 30 mins in ms
      expect(result.responseTimes[0].threadId).toBe(threadId);
      expect(result.responseTimes[0].sentMessageId).toBe("s1");
      expect(result.responseTimes[0].receivedMessageId).toBe("r1");
      expect(result.processedThreadsCount).toBe(1);
    });

    it("should handle sequence: Received -> Sent -> Received -> Sent", async () => {
      const threadId = "t1";
      const sentMsg = getMockMessageHelper({ threadId, id: "s1" });

      // T0: Received
      // T1: Sent (Response to T0) -> 30 mins
      // T2: Received (Reply to T1) -> 1 hour after T1
      // T3: Sent (Response to T2) -> 15 mins after T2

      const t0 = new Date("2024-01-01T10:00:00Z");
      const t1 = new Date("2024-01-01T10:30:00Z");
      const t2 = new Date("2024-01-01T11:30:00Z");
      const t3 = new Date("2024-01-01T11:45:00Z");

      mockEmailProvider.getThreadMessages.mockResolvedValue([
        {
          ...getMockMessageHelper({ id: "r1", threadId }),
          internalDate: t0.toISOString(),
        },
        {
          ...getMockMessageHelper({ id: "s1", threadId }),
          internalDate: t1.toISOString(),
          labelIds: ["SENT"],
        },
        {
          ...getMockMessageHelper({ id: "r2", threadId }),
          internalDate: t2.toISOString(),
        },
        {
          ...getMockMessageHelper({ id: "s2", threadId }),
          internalDate: t3.toISOString(),
          labelIds: ["SENT"],
        },
      ]);

      const result = await calculateResponseTimes(
        [sentMsg, getMockMessageHelper({ threadId, id: "s2" })],
        mockEmailProvider,
        logger,
      );

      // calculateResponseTimes processes unique threads from the input list.
      // Since both sent messages share the same threadId, it processes the thread once.
      // The internal logic finds ALL pairs in that thread.

      expect(result.responseTimes).toHaveLength(2);
      expect(result.responseTimes[0].responseTimeMs).toBe(30 * 60 * 1000); // 30 mins
      expect(result.responseTimes[1].responseTimeMs).toBe(15 * 60 * 1000); // 15 mins
      expect(result.processedThreadsCount).toBe(1);
    });

    it("should ignore multiple sent messages without intervening received message", async () => {
      const threadId = "t1";
      const sentMsg = getMockMessageHelper({ threadId, id: "s1" });

      const t0 = new Date("2024-01-01T10:00:00Z");
      const t1 = new Date("2024-01-01T10:30:00Z");
      const t2 = new Date("2024-01-01T10:35:00Z"); // 5 mins after T1

      mockEmailProvider.getThreadMessages.mockResolvedValue([
        {
          ...getMockMessageHelper({ id: "r1", threadId }),
          internalDate: t0.toISOString(),
        },
        {
          ...getMockMessageHelper({ id: "s1", threadId }),
          internalDate: t1.toISOString(),
          labelIds: ["SENT"],
        },
        {
          ...getMockMessageHelper({ id: "s2", threadId }),
          internalDate: t2.toISOString(),
          labelIds: ["SENT"],
        },
      ]);

      const result = await calculateResponseTimes(
        [sentMsg],
        mockEmailProvider,
        logger,
      );

      expect(result.responseTimes).toHaveLength(1);
      expect(result.responseTimes[0].responseTimeMs).toBe(30 * 60 * 1000); // 30 mins
      // T2 is ignored because lastReceivedMessage is nullified after T1
    });

    it("should fallback to id check if SENT label not found", async () => {
      const threadId = "t1";
      const sentMsg = getMockMessageHelper({ threadId, id: "s1" });

      const t0 = new Date("2024-01-01T10:00:00Z");
      const t1 = new Date("2024-01-01T10:30:00Z");

      mockEmailProvider.getThreadMessages.mockResolvedValue([
        {
          ...getMockMessageHelper({ id: "r1", threadId }),
          internalDate: t0.toISOString(),
        },
        {
          ...getMockMessageHelper({ id: "s1", threadId }),
          internalDate: t1.toISOString(),
          labelIds: [],
        }, // No SENT label
      ]);

      const result = await calculateResponseTimes(
        [sentMsg], // s1 is in the list
        mockEmailProvider,
        logger,
      );

      expect(result.responseTimes).toHaveLength(1);
      expect(result.responseTimes[0].responseTimeMs).toBe(30 * 60 * 1000); // 30 mins
    });
  });

  describe("calculateSummaryStats", () => {
    it("should calculate correct stats", async () => {
      const responseTimes = [
        { threadId: "t1", responseTimeMs: 30 * 60 * 1000 },
        { threadId: "t2", responseTimeMs: 90 * 60 * 1000 },
        { threadId: "t3", responseTimeMs: 60 * 60 * 1000 },
      ] as any[];

      const result = calculateSummaryStats(responseTimes);

      expect(result.averageResponseTime).toBe(60); // (30+90+60)/3
      expect(result.medianResponseTime).toBe(60); // Sorted: 30, 60, 90 -> 60
      expect(result.within1Hour).toBe(Math.round((2 / 3) * 100)); // 30 and 60 are <= 60
    });
  });

  describe("calculateDistribution", () => {
    it("should bucket correctly", () => {
      // responseTimeMs in milliseconds
      const responseTimes = [
        { responseTimeMs: 30 * 60 * 1000 }, // 30min -> < 1h
        { responseTimeMs: 120 * 60 * 1000 }, // 2h -> 1-4h
        { responseTimeMs: 300 * 60 * 1000 }, // 5h -> 4-24h
        { responseTimeMs: 2000 * 60 * 1000 }, // ~33h -> 1-3d
      ] as any[];

      const result = calculateDistribution(responseTimes);

      expect(result.lessThan1Hour).toBe(1);
      expect(result.oneToFourHours).toBe(1);
      expect(result.fourTo24Hours).toBe(1);
      expect(result.oneToThreeDays).toBe(1);
      expect(result.threeToSevenDays).toBe(0);
    });
  });
});
