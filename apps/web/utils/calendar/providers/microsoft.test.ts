import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { createMicrosoftCalendarProvider } from "@/utils/calendar/providers/microsoft";
import {
  fetchMicrosoftCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/outlook/calendar-client";

const logger = createTestLogger();

vi.mock("@/utils/outlook/calendar-client", () => ({
  fetchMicrosoftCalendars: vi.fn(),
  getCalendarClientWithRefresh: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    calendar: { upsert: vi.fn() },
    calendarConnection: { update: vi.fn() },
  },
}));

vi.mock("../timezone-helpers", () => ({
  autoPopulateTimezone: vi.fn(),
}));

describe("microsoft calendar sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the default calendar as primary so bookings without an explicit destination can target it", async () => {
    vi.mocked(getCalendarClientWithRefresh).mockResolvedValue(
      "calendar-client" as any,
    );
    vi.mocked(fetchMicrosoftCalendars).mockResolvedValue([
      {
        id: "default-calendar-id",
        name: "Calendar",
        isDefaultCalendar: true,
      },
      {
        id: "secondary-calendar-id",
        name: "Birthdays",
        isDefaultCalendar: false,
      },
    ]);

    const provider = createMicrosoftCalendarProvider(logger);

    await provider.syncCalendars(
      "connection-id",
      "access-token",
      "refresh-token",
      "email-account-id",
      new Date("2026-05-08T00:00:00.000Z"),
    );

    const upsertCalls = vi.mocked(prisma.calendar.upsert).mock.calls;
    const defaultUpsert = upsertCalls.find(
      ([call]) =>
        (call as any).where.connectionId_calendarId.calendarId ===
        "default-calendar-id",
    )?.[0] as any;
    const secondaryUpsert = upsertCalls.find(
      ([call]) =>
        (call as any).where.connectionId_calendarId.calendarId ===
        "secondary-calendar-id",
    )?.[0] as any;

    expect(defaultUpsert.create).toMatchObject({
      isEnabled: true,
      primary: true,
    });
    expect(defaultUpsert.update).toMatchObject({ primary: true });

    expect(secondaryUpsert.create).toMatchObject({
      isEnabled: true,
      primary: false,
    });
    expect(secondaryUpsert.update).toMatchObject({ primary: false });
    // Re-syncing must not overwrite a user's manual toggle of isEnabled.
    expect(defaultUpsert.update).not.toHaveProperty("isEnabled");
    expect(secondaryUpsert.update).not.toHaveProperty("isEnabled");
  });
});
