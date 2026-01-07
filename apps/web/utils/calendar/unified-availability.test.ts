import { describe, it, expect, beforeEach, vi } from "vitest";
import { getUnifiedCalendarAvailability } from "./unified-availability";
import prisma from "@/utils/prisma";
import { createGoogleAvailabilityProvider } from "./providers/google-availability";
import { createMicrosoftAvailabilityProvider } from "./providers/microsoft-availability";
import type { BusyPeriod } from "./availability-types";
import { getCalendarConnection } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("./providers/google-availability");
vi.mock("./providers/microsoft-availability");

const logger = createScopedLogger("test");

describe("getUnifiedCalendarAvailability", () => {
  const emailAccountId = "test-account-id";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("day boundary handling", () => {
    it("should query correct day when UTC date shifts to previous day in target timezone", async () => {
      // This tests Bug 1: When user wants Nov 17 in LA timezone but passes UTC date,
      // the function should still query Nov 17 in LA (not Nov 16)
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      // User passes midnight UTC on Nov 17
      // In LA (UTC-8), this would be Nov 16 at 4pm if naively converted
      await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-17T23:59:59Z"),
        timezone: "America/Los_Angeles",
        logger,
      });

      // The provider should be called with timeMin/timeMax representing Nov 17 in LA
      // TZDate.toISOString() outputs with timezone offset: 2025-11-17T00:00:00.000-08:00
      // which is equivalent to 2025-11-17T08:00:00Z
      expect(mockGoogleProvider.fetchBusyPeriods).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: expect.stringContaining("2025-11-17T00:00:00"),
          timeMax: expect.stringContaining("2025-11-17T23:59:59"),
        }),
      );
    });

    it("should query correct day when UTC date shifts to next day in target timezone", async () => {
      // For timezones ahead of UTC (e.g., Asia/Jerusalem UTC+2)
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-17T23:59:59Z"),
        timezone: "Asia/Jerusalem",
        logger,
      });

      // TZDate.toISOString() outputs with timezone offset
      // Start of Nov 17 in Jerusalem = 2025-11-17T00:00:00+02:00
      // End of Nov 17 in Jerusalem = 2025-11-17T23:59:59+02:00
      expect(mockGoogleProvider.fetchBusyPeriods).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: expect.stringContaining("2025-11-17T00:00:00"),
          timeMax: expect.stringContaining("2025-11-17T23:59:59"),
        }),
      );
    });

    it("should accept string dates in YYYY-MM-DD format", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: "2025-11-17",
        endDate: "2025-11-17",
        timezone: "America/Los_Angeles",
        logger,
      });

      expect(mockGoogleProvider.fetchBusyPeriods).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: expect.stringContaining("2025-11-17T00:00:00"),
          timeMax: expect.stringContaining("2025-11-17T23:59:59"),
        }),
      );
    });

    it("should accept string dates in ISO datetime format", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      // ISO datetime string - should extract the date part
      await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: "2025-11-17T10:30:00Z",
        endDate: "2025-11-17T15:00:00Z",
        timezone: "America/Los_Angeles",
        logger,
      });

      // Should still query full day Nov 17 in LA
      expect(mockGoogleProvider.fetchBusyPeriods).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: expect.stringContaining("2025-11-17T00:00:00"),
          timeMax: expect.stringContaining("2025-11-17T23:59:59"),
        }),
      );
    });
  });

  describe("timezone conversion", () => {
    it("should convert UTC busy periods to America/Los_Angeles timezone", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      // Mock busy period in UTC: Nov 17, 5am-9pm UTC
      const mockBusyPeriods: BusyPeriod[] = [
        {
          start: "2025-11-17T05:00:00Z",
          end: "2025-11-17T21:00:00Z",
        },
      ];

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue(mockBusyPeriods),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      const result = await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-17T23:59:59Z"),
        timezone: "America/Los_Angeles",
        logger,
      });

      expect(result).toHaveLength(1);

      // In LA timezone (UTC-8), 5am UTC = 9pm previous day, 9pm UTC = 1pm same day
      // Should be Nov 16 21:00 to Nov 17 13:00 in PST
      expect(result[0].start).toMatch(/2025-11-16T21:00:00-08:00/);
      expect(result[0].end).toMatch(/2025-11-17T13:00:00-08:00/);
    });

    it("should convert UTC busy periods to Asia/Jerusalem timezone", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      // Mock busy period in UTC: Nov 17, 10am-6pm UTC
      const mockBusyPeriods: BusyPeriod[] = [
        {
          start: "2025-11-17T10:00:00Z",
          end: "2025-11-17T18:00:00Z",
        },
      ];

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue(mockBusyPeriods),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      const result = await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-17T23:59:59Z"),
        timezone: "Asia/Jerusalem",
        logger,
      });

      expect(result).toHaveLength(1);

      // In Jerusalem timezone (UTC+2), 10am UTC = 12pm, 6pm UTC = 8pm
      expect(result[0].start).toMatch(/2025-11-17T12:00:00\+02:00/);
      expect(result[0].end).toMatch(/2025-11-17T20:00:00\+02:00/);
    });

    it("should handle busy periods spanning midnight in target timezone", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({ provider: "google", calendarIds: ["cal-1"] }),
      ]);

      // Event from 11pm to 3am UTC (crosses midnight in PST: 3pm to 7pm previous day)
      const mockBusyPeriods: BusyPeriod[] = [
        {
          start: "2025-11-17T23:00:00Z",
          end: "2025-11-18T03:00:00Z",
        },
      ];

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue(mockBusyPeriods),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      const result = await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-18T23:59:59Z"),
        timezone: "America/Los_Angeles",
        logger,
      });

      expect(result).toHaveLength(1);

      // Verify dates are correctly adjusted
      expect(result[0].start).toContain("2025-11-17T15:00:00");
      expect(result[0].end).toContain("2025-11-17T19:00:00");
    });

    it("should handle multiple busy periods from different providers", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        getCalendarConnection({
          provider: "google",
          calendarIds: ["cal-google"],
        }),
        getCalendarConnection({
          provider: "microsoft",
          calendarIds: ["cal-microsoft"],
        }),
      ]);

      const mockGoogleProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue([
          {
            start: "2025-11-17T14:00:00Z",
            end: "2025-11-17T15:00:00Z",
          },
        ]),
      };
      vi.mocked(createGoogleAvailabilityProvider).mockReturnValue(
        mockGoogleProvider as any,
      );

      const mockMicrosoftProvider = {
        fetchBusyPeriods: vi.fn().mockResolvedValue([
          {
            start: "2025-11-17T18:00:00Z",
            end: "2025-11-17T19:00:00Z",
          },
        ]),
      };
      vi.mocked(createMicrosoftAvailabilityProvider).mockReturnValue(
        mockMicrosoftProvider as any,
      );

      const result = await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-17T23:59:59Z"),
        timezone: "America/New_York",
        logger,
      });

      expect(result).toHaveLength(2);

      // Both periods should be converted to EST (UTC-5)
      expect(result[0].start).toContain("2025-11-17T09:00:00");
      expect(result[1].start).toContain("2025-11-17T13:00:00");
    });

    it("should return empty array when no calendar connections", async () => {
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);

      const result = await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: new Date("2025-11-17T00:00:00Z"),
        endDate: new Date("2025-11-17T23:59:59Z"),
        timezone: "UTC",
        logger,
      });

      expect(result).toEqual([]);
    });
  });
});
