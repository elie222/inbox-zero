import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import prisma from "@/utils/prisma";

vi.mock("@/utils/prisma", () => ({
  default: { calendarConnection: { count: vi.fn() } },
}));

vi.mock("@/utils/calendar/event-provider", () => ({
  createCalendarEventProviders: vi.fn(),
}));

const logger = createTestLogger();

const fetchParams = {
  emailAccountId: "account-1",
  timeMin: new Date("2026-07-29T10:00:00.000Z"),
  timeMax: new Date("2026-07-29T11:00:00.000Z"),
  maxResultsPerProvider: 50,
  logger,
};

describe("fetchCalendarEventsInWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.calendarConnection.count).mockResolvedValue(1);
  });

  it("reports incomplete when no provider could be created", async () => {
    // Connections with a missing refresh token or a failed construction are
    // silently skipped, so an empty provider list proves nothing about the
    // calendar. Complete here would cancel every booked bot.
    vi.mocked(createCalendarEventProviders).mockResolvedValue([]);

    const result = await fetchCalendarEventsInWindow(fetchParams);

    expect(result).toEqual({ events: [], complete: false });
  });

  it("reports incomplete when fewer providers were built than calendars are connected", async () => {
    vi.mocked(prisma.calendarConnection.count).mockResolvedValue(2);
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      fakeProvider([makeEvent("event-1")]),
    ]);

    const result = await fetchCalendarEventsInWindow(fetchParams);

    expect(result.complete).toBe(false);
    expect(result.events).toHaveLength(1);
  });

  it("reports incomplete when a provider fetch fails", async () => {
    vi.mocked(prisma.calendarConnection.count).mockResolvedValue(2);
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      fakeProvider([makeEvent("event-1")]),
      {
        fetchEvents: vi.fn().mockRejectedValue(new Error("provider down")),
      } as never,
    ]);

    const result = await fetchCalendarEventsInWindow(fetchParams);

    expect(result.complete).toBe(false);
    expect(result.events).toHaveLength(1);
  });

  it("reports complete when every connected calendar was fetched", async () => {
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      fakeProvider([makeEvent("event-1")]),
    ]);

    const result = await fetchCalendarEventsInWindow(fetchParams);

    expect(result.complete).toBe(true);
    expect(result.events.map((event) => event.id)).toEqual(["event-1"]);
  });
});

function makeEvent(id: string): CalendarEvent {
  return {
    id,
    title: `Meeting ${id}`,
    startTime: new Date("2026-07-29T10:30:00.000Z"),
    endTime: new Date("2026-07-29T10:55:00.000Z"),
    attendees: [],
  } as unknown as CalendarEvent;
}

function fakeProvider(events: CalendarEvent[]) {
  return {
    fetchEvents: vi.fn().mockResolvedValue(events),
  } as never;
}
