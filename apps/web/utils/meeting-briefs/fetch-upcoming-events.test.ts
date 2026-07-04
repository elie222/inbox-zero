import { addMinutes } from "date-fns/addMinutes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type {
  CalendarEvent,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";
import {
  fetchUpcomingEvents,
  filterEventsWithExternalGuests,
} from "./fetch-upcoming-events";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/calendar/event-provider");

const logger = createTestLogger();

describe("fetchUpcomingEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips cancelled event placeholder titles", async () => {
    const provider = createProvider([
      createEvent({
        id: "skip-1",
        title: "Cancelled event: Customer Sync",
        startTime: new Date("2024-01-20T09:00:00Z"),
      }),
      createEvent({
        id: "keep-1",
        title: "Customer Sync",
        startTime: new Date("2024-01-20T09:30:00Z"),
      }),
      createEvent({
        id: "skip-2",
        title: "Canceled: Product Demo",
        startTime: new Date("2024-01-20T10:00:00Z"),
      }),
      createEvent({
        id: "keep-2",
        title: "Cancellation Policy Review",
        startTime: new Date("2024-01-20T10:30:00Z"),
      }),
    ]);

    vi.mocked(createCalendarEventProviders).mockResolvedValue([provider]);

    const events = await fetchUpcomingEvents({
      emailAccountId: "email-account-id",
      minutesBefore: 240,
      logger,
    });

    expect(events.map((event) => event.id)).toEqual(["keep-1", "keep-2"]);
  });

  it("keeps events sorted by start time after filtering", async () => {
    const provider = createProvider([
      createEvent({
        id: "later",
        title: "Design Review",
        startTime: new Date("2024-01-20T11:00:00Z"),
      }),
      createEvent({
        id: "skip",
        title: "Cancelled: Standup",
        startTime: new Date("2024-01-20T08:00:00Z"),
      }),
      createEvent({
        id: "earlier",
        title: "Sales Call",
        startTime: new Date("2024-01-20T09:00:00Z"),
      }),
    ]);

    vi.mocked(createCalendarEventProviders).mockResolvedValue([provider]);

    const events = await fetchUpcomingEvents({
      emailAccountId: "email-account-id",
      minutesBefore: 240,
      logger,
    });

    expect(events.map((event) => event.id)).toEqual(["earlier", "later"]);
  });

  describe("lookahead window", () => {
    const now = new Date("2024-01-20T09:00:00Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("includes events entering the lead window before the next cron tick", async () => {
      // With minutesBefore=5 and a 15-minute cron, an event 18 minutes out
      // would be missed entirely if the window were only [now, now + 5m]:
      // its lead window [T-5, T] can fall between two cron ticks.
      const provider = createWindowedProvider([
        createEvent({
          id: "between-ticks",
          startTime: addMinutes(now, 18),
        }),
      ]);

      vi.mocked(createCalendarEventProviders).mockResolvedValue([provider]);

      const events = await fetchUpcomingEvents({
        emailAccountId: "email-account-id",
        minutesBefore: 5,
        logger,
      });

      expect(events.map((event) => event.id)).toEqual(["between-ticks"]);
    });

    it("excludes events beyond the lead window plus one cron interval", async () => {
      const provider = createWindowedProvider([
        createEvent({
          id: "too-far-out",
          startTime: addMinutes(now, 25),
        }),
      ]);

      vi.mocked(createCalendarEventProviders).mockResolvedValue([provider]);

      const events = await fetchUpcomingEvents({
        emailAccountId: "email-account-id",
        minutesBefore: 5,
        logger,
      });

      expect(events).toEqual([]);
    });
  });
});

describe("filterEventsWithExternalGuests", () => {
  it("keeps only events that have guests outside the user's team context", () => {
    const events = [
      createEvent({
        id: "team-only",
        attendees: [
          { email: "user@company.com" },
          { email: "teammate@company.com" },
        ],
      }),
      createEvent({
        id: "user-only",
        attendees: [{ email: "user@company.com" }],
      }),
      createEvent({
        id: "customer-call",
        attendees: [
          { email: "user@company.com" },
          { email: "customer@example.com" },
        ],
      }),
      createEvent({
        id: "personal-domain-peer",
        attendees: [{ email: "user@gmail.com" }, { email: "guest@gmail.com" }],
      }),
    ];

    expect(
      filterEventsWithExternalGuests(
        events.slice(0, 3),
        "user@company.com",
      ).map((event) => event.id),
    ).toEqual(["customer-call"]);
    expect(
      filterEventsWithExternalGuests(events.slice(3), "user@gmail.com").map(
        (event) => event.id,
      ),
    ).toEqual(["personal-domain-peer"]);
  });
});

function createProvider(events: CalendarEvent[]): CalendarEventProvider {
  return {
    fetchEvents: vi.fn().mockResolvedValue(events),
    fetchEventsWithAttendee: vi.fn().mockResolvedValue([]),
  };
}

// Mimics the calendar API: only returns events within the requested window.
function createWindowedProvider(
  events: CalendarEvent[],
): CalendarEventProvider {
  return {
    fetchEvents: vi.fn(
      async ({ timeMin, timeMax }: { timeMin: Date; timeMax: Date }) =>
        events.filter(
          (event) => event.startTime >= timeMin && event.startTime <= timeMax,
        ),
    ),
    fetchEventsWithAttendee: vi.fn().mockResolvedValue([]),
  };
}

function createEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  const startTime = overrides.startTime ?? new Date("2024-01-20T09:00:00Z");

  return {
    id: overrides.id ?? "event-id",
    title: overrides.title ?? "Meeting",
    description: overrides.description,
    location: overrides.location,
    eventUrl: overrides.eventUrl,
    videoConferenceLink: overrides.videoConferenceLink,
    startTime,
    endTime:
      overrides.endTime ?? new Date(startTime.getTime() + 30 * 60 * 1000),
    attendees: overrides.attendees ?? [{ email: "guest@example.com" }],
  };
}
