import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import { createScopedLogger } from "@/utils/logger";
import type {
  CalendarEvent,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";
import { fetchUpcomingEvents } from "./fetch-upcoming-events";

vi.mock("@/utils/calendar/event-provider");

const logger = createScopedLogger("test");

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
});

function createProvider(events: CalendarEvent[]): CalendarEventProvider {
  return {
    fetchEvents: vi.fn().mockResolvedValue(events),
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
