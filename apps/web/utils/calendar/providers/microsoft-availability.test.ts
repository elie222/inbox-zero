import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMicrosoftAvailabilityProvider } from "./microsoft-availability";
import { createScopedLogger } from "@/utils/logger";
import type { Client } from "@microsoft/microsoft-graph-client";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/outlook/calendar-client", () => ({
  getCalendarClientWithRefresh: vi.fn(),
}));

const logger = createScopedLogger("test");

describe("createMicrosoftAvailabilityProvider", () => {
  let mockClient: Partial<Client>;
  let mockApiResponse: {
    query: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockApiResponse = {
      query: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      get: vi.fn(),
    };

    mockClient = {
      api: vi.fn().mockReturnValue(mockApiResponse),
    };

    const { getCalendarClientWithRefresh } = await import(
      "@/utils/outlook/calendar-client"
    );
    vi.mocked(getCalendarClientWithRefresh).mockResolvedValue(
      mockClient as Client,
    );
  });

  describe("fetchBusyPeriods", () => {
    it("should request events in UTC timezone", async () => {
      mockApiResponse.get.mockResolvedValue({
        value: [],
      });

      const provider = createMicrosoftAvailabilityProvider(logger);

      await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      // Verify that the Prefer header is set to request UTC times
      expect(mockApiResponse.header).toHaveBeenCalledWith(
        "Prefer",
        'outlook.timezone="UTC"',
      );
    });

    it("should add Z suffix to datetime values without it", async () => {
      // Microsoft Graph API with UTC preference returns times without Z suffix
      mockApiResponse.get.mockResolvedValue({
        value: [
          {
            showAs: "busy",
            start: { dateTime: "2025-11-17T14:00:00.0000000" },
            end: { dateTime: "2025-11-17T15:00:00.0000000" },
          },
        ],
      });

      const provider = createMicrosoftAvailabilityProvider(logger);

      const result = await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].start).toBe("2025-11-17T14:00:00.0000000Z");
      expect(result[0].end).toBe("2025-11-17T15:00:00.0000000Z");
    });

    it("should not double-add Z suffix if already present", async () => {
      mockApiResponse.get.mockResolvedValue({
        value: [
          {
            showAs: "busy",
            start: { dateTime: "2025-11-17T14:00:00Z" },
            end: { dateTime: "2025-11-17T15:00:00Z" },
          },
        ],
      });

      const provider = createMicrosoftAvailabilityProvider(logger);

      const result = await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].start).toBe("2025-11-17T14:00:00Z");
      expect(result[0].end).toBe("2025-11-17T15:00:00Z");
    });

    it("should filter out free events", async () => {
      mockApiResponse.get.mockResolvedValue({
        value: [
          {
            showAs: "free",
            start: { dateTime: "2025-11-17T10:00:00.0000000" },
            end: { dateTime: "2025-11-17T11:00:00.0000000" },
          },
          {
            showAs: "busy",
            start: { dateTime: "2025-11-17T14:00:00.0000000" },
            end: { dateTime: "2025-11-17T15:00:00.0000000" },
          },
          {
            showAs: "tentative",
            start: { dateTime: "2025-11-17T16:00:00.0000000" },
            end: { dateTime: "2025-11-17T17:00:00.0000000" },
          },
        ],
      });

      const provider = createMicrosoftAvailabilityProvider(logger);

      const result = await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      // Should have 2 events (busy and tentative), not the free one
      expect(result).toHaveLength(2);
      expect(result[0].start).toContain("14:00:00");
      expect(result[1].start).toContain("16:00:00");
    });

    it("should handle events from multiple calendars", async () => {
      // First calendar response
      mockApiResponse.get
        .mockResolvedValueOnce({
          value: [
            {
              showAs: "busy",
              start: { dateTime: "2025-11-17T10:00:00.0000000" },
              end: { dateTime: "2025-11-17T11:00:00.0000000" },
            },
          ],
        })
        // Second calendar response
        .mockResolvedValueOnce({
          value: [
            {
              showAs: "busy",
              start: { dateTime: "2025-11-17T14:00:00.0000000" },
              end: { dateTime: "2025-11-17T15:00:00.0000000" },
            },
          ],
        });

      const provider = createMicrosoftAvailabilityProvider(logger);

      const result = await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1", "cal-2"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      expect(result).toHaveLength(2);
      expect(result[0].start).toContain("10:00:00");
      expect(result[1].start).toContain("14:00:00");
    });

    it("should handle pagination with @odata.nextLink", async () => {
      mockApiResponse.get
        .mockResolvedValueOnce({
          value: [
            {
              showAs: "busy",
              start: { dateTime: "2025-11-17T10:00:00.0000000" },
              end: { dateTime: "2025-11-17T11:00:00.0000000" },
            },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
        })
        .mockResolvedValueOnce({
          value: [
            {
              showAs: "busy",
              start: { dateTime: "2025-11-17T14:00:00.0000000" },
              end: { dateTime: "2025-11-17T15:00:00.0000000" },
            },
          ],
        });

      const provider = createMicrosoftAvailabilityProvider(logger);

      const result = await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      expect(result).toHaveLength(2);
    });

    it("should return empty array for empty calendar", async () => {
      mockApiResponse.get.mockResolvedValue({
        value: [],
      });

      const provider = createMicrosoftAvailabilityProvider(logger);

      const result = await provider.fetchBusyPeriods({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "email-account-id",
        calendarIds: ["cal-1"],
        timeMin: "2025-11-17T00:00:00Z",
        timeMax: "2025-11-17T23:59:59Z",
      });

      expect(result).toEqual([]);
    });
  });
});
