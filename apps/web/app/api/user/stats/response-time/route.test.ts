import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calculateResponseTimes,
  calculateSummaryStats,
  calculateDistribution,
  calculateTrend,
} from "./route";
import { getMockMessage } from "@/utils/test/helpers";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

// Mock helpers if they aren't exported from the main helpers file or if we need specific ones
// The user provided a helpers file content in previous turn, I'll assume it's at apps/web/__tests__/helpers.ts
// But I will mock what I need here to be self-contained or import if accessible.
// The path provided in the prompt was apps/web/__tests__/helpers.ts.
// I'll use relative import if possible or alias.
import { getMockMessage as getMockMessageHelper } from "../../../../../__tests__/helpers";

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
} as unknown as Logger;

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
      const sentMsg = {
        threadId,
        id: "s1",
        headers: { to: "other@example.com" },
      };

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
        mockLogger,
      );

      expect(result).toHaveLength(1);
      expect(result[0].responseTimeMinutes).toBe(30);
      expect(result[0].threadId).toBe(threadId);
    });

    it("should handle sequence: Received -> Sent -> Received -> Sent", async () => {
      const threadId = "t1";
      const sentMsg = { threadId, id: "s1" };

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
        [sentMsg, { threadId, id: "s2" }], // pass both sent messages to trigger processing
        mockEmailProvider,
        mockLogger,
      );

      // calculateResponseTimes processes unique threads from the input list.
      // Since both sent messages share the same threadId, it processes the thread once.
      // The internal logic finds ALL pairs in that thread.

      expect(result).toHaveLength(2);
      expect(result[0].responseTimeMinutes).toBe(30);
      expect(result[1].responseTimeMinutes).toBe(15);
    });

    it("should ignore multiple sent messages without intervening received message", async () => {
      const threadId = "t1";
      const sentMsg = { threadId, id: "s1" };

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
        mockLogger,
      );

      expect(result).toHaveLength(1);
      expect(result[0].responseTimeMinutes).toBe(30);
      // T2 is ignored because lastReceivedDate is nullified after T1
    });

    it("should fallback to id check if SENT label not found", async () => {
      const threadId = "t1";
      const sentMsg = { threadId, id: "s1" };

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
        mockLogger,
      );

      expect(result).toHaveLength(1);
      expect(result[0].responseTimeMinutes).toBe(30);
    });
  });

  describe("calculateSummaryStats", () => {
    const mockProvider = {} as any;

    it("should calculate correct stats", async () => {
      const responseTimes = [
        { responseTimeMinutes: 30 },
        { responseTimeMinutes: 90 },
        { responseTimeMinutes: 60 },
      ] as any[];

      const result = await calculateSummaryStats(
        responseTimes,
        null,
        null,
        mockProvider,
        mockLogger,
      );

      expect(result.averageResponseTime).toBe(60); // (30+90+60)/3
      expect(result.medianResponseTime).toBe(60); // Sorted: 30, 60, 90 -> 60
      expect(result.within1Hour).toBe(Math.round((2 / 3) * 100)); // 30 and 60 are <= 60
    });
  });

  describe("calculateDistribution", () => {
    it("should bucket correctly", () => {
      const responseTimes = [
        { responseTimeMinutes: 30 }, // < 1h
        { responseTimeMinutes: 120 }, // 1-4h
        { responseTimeMinutes: 300 }, // 4-24h
        { responseTimeMinutes: 2000 }, // 1-3d
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
