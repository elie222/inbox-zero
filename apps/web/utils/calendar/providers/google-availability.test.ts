import { beforeEach, describe, expect, it, vi } from "vitest";
import type { calendar_v3 } from "@googleapis/calendar";
import { createTestLogger } from "@/__tests__/helpers";
import { createGoogleAvailabilityProvider } from "./google-availability";
import type { CalendarAvailabilityError } from "../availability-error";

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  getCalendarClientWithRefresh: vi.fn(),
}));

const logger = createTestLogger();

describe("createGoogleAvailabilityProvider", () => {
  const query = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getCalendarClientWithRefresh } = await import("../client");
    vi.mocked(getCalendarClientWithRefresh).mockResolvedValue({
      freebusy: {
        query,
      },
    } as unknown as calendar_v3.Calendar);
  });

  it("skips individual calendar errors by default", async () => {
    query.mockResolvedValue({
      data: {
        calendars: {
          "cal-1": {
            errors: [{ reason: "notFound" }],
          },
        },
      },
    });

    const provider = createGoogleAvailabilityProvider(logger);
    const result = await provider.fetchBusyPeriods({
      accessToken: "token",
      calendarIds: ["cal-1"],
      connectionId: "connection-id",
      emailAccountId: "email-account-id",
      expiresAt: Date.now() + 60_000,
      refreshToken: "refresh-token",
      timeMax: "2026-05-05T00:00:00.000Z",
      timeMin: "2026-05-04T00:00:00.000Z",
    });

    expect(result).toEqual([]);
  });

  it("fails closed on individual calendar errors when requested", async () => {
    const calendarErrors = [{ reason: "notFound" }];
    query.mockResolvedValue({
      data: {
        calendars: {
          "cal-1": {
            errors: calendarErrors,
          },
        },
      },
    });

    const provider = createGoogleAvailabilityProvider(logger);

    await expect(
      provider.fetchBusyPeriods({
        accessToken: "token",
        calendarIds: ["cal-1"],
        connectionId: "connection-id",
        emailAccountId: "email-account-id",
        expiresAt: Date.now() + 60_000,
        failOnCalendarError: true,
        refreshToken: "refresh-token",
        timeMax: "2026-05-05T00:00:00.000Z",
        timeMin: "2026-05-04T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      message: "Failed to fetch Google calendar availability",
      name: "CalendarAvailabilityError",
      provider: "google",
      calendarErrors: [{ calendarId: "cal-1", errors: calendarErrors }],
    } satisfies Partial<CalendarAvailabilityError>);
  });
});
