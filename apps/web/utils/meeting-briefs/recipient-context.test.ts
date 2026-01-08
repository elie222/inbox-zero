import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMeetingContext,
  formatMeetingContextForPrompt,
  type MeetingContext,
} from "./recipient-context";
import type { CalendarEventProvider } from "@/utils/calendar/event-types";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

vi.mock("@/utils/calendar/event-provider");
vi.mock("@/utils/date", () => ({
  formatInUserTimezone: vi.fn((date: Date) => {
    // Simple mock that returns a predictable format for testing in UTC
    const d = new Date(date);
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const dayName = dayNames[d.getUTCDay()];
    const month = monthNames[d.getUTCMonth()];
    const day = d.getUTCDate();
    const hours = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${dayName}, ${month} ${day} at ${displayHours}:${displayMinutes} ${ampm}`;
  }),
}));

describe("recipient-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-20T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatMeetingContextForPrompt", () => {
    it("returns null for empty meetings array", () => {
      const result = formatMeetingContextForPrompt([]);
      expect(result).toBeNull();
    });

    it("formats prompt with past meetings only", () => {
      const pastDate = new Date("2024-01-15T10:00:00Z");
      const meetings: MeetingContext[] = [
        {
          eventTitle: "Q1 Planning Meeting",
          eventTime: pastDate,
          eventDescription: "Discuss Q1 goals and objectives",
          eventLocation: "Conference Room A",
          isPast: true,
        },
        {
          eventTitle: "Team Standup",
          eventTime: new Date("2024-01-10T09:00:00Z"),
          isPast: true,
        },
      ];

      const result = formatMeetingContextForPrompt(meetings);

      // Readable prompt text:
      console.log("Prompt:", result);

      expect(result).toBe(`You have meeting history with this person:

<recent_meetings>
- "Q1 Planning Meeting" on Monday, January 15 at 10:00 AM (Conference Room A)
  Description: Discuss Q1 goals and objectives
- "Team Standup" on Wednesday, January 10 at 9:00 AM
</recent_meetings>

Use this context naturally if relevant. For past meetings, you might reference topics discussed.`);
    });

    it("formats prompt with upcoming meetings only", () => {
      const futureDate = new Date("2024-02-01T14:00:00Z");
      const meetings: MeetingContext[] = [
        {
          eventTitle: "Product Review",
          eventTime: futureDate,
          eventDescription: "Review product roadmap and features",
          eventLocation: "Zoom",
          isPast: false,
        },
      ];

      const result = formatMeetingContextForPrompt(meetings);

      // Readable prompt text:
      console.log("Prompt:", result);

      expect(result).toBe(`You have meeting history with this person:

<upcoming_meetings>
- "Product Review" on Thursday, February 1 at 2:00 PM (Zoom)
  Description: Review product roadmap and features
</upcoming_meetings>

Use this context naturally if relevant. For upcoming meetings, you might say "Looking forward to our call" or "We can discuss this further in our upcoming meeting."`);
    });

    it("formats prompt with both past and upcoming meetings", () => {
      const meetings: MeetingContext[] = [
        {
          eventTitle: "Past Meeting",
          eventTime: new Date("2024-01-15T10:00:00Z"),
          eventDescription: "This is a past meeting description",
          isPast: true,
        },
        {
          eventTitle: "Upcoming Meeting",
          eventTime: new Date("2024-02-01T14:00:00Z"),
          eventDescription: "This is an upcoming meeting description",
          eventLocation: "Office",
          isPast: false,
        },
      ];

      const result = formatMeetingContextForPrompt(meetings);

      // Readable prompt text:
      console.log("Prompt:", result);

      expect(result).toBe(`You have meeting history with this person:

<recent_meetings>
- "Past Meeting" on Monday, January 15 at 10:00 AM
  Description: This is a past meeting description
</recent_meetings>

<upcoming_meetings>
- "Upcoming Meeting" on Thursday, February 1 at 2:00 PM (Office)
  Description: This is an upcoming meeting description
</upcoming_meetings>

Use this context naturally if relevant. For past meetings, you might reference topics discussed. For upcoming meetings, you might say "Looking forward to our call" or "We can discuss this further in our upcoming meeting."`);
    });

    it("truncates long descriptions", () => {
      const longDescription = "a".repeat(600);
      const meetings: MeetingContext[] = [
        {
          eventTitle: "Meeting with Long Description",
          eventTime: new Date("2024-01-15T10:00:00Z"),
          eventDescription: longDescription,
          isPast: true,
        },
      ];

      const result = formatMeetingContextForPrompt(meetings);

      // Readable prompt text:
      console.log("Prompt:", result);

      expect(result).toContain("...");
      expect(result).toContain("Meeting with Long Description");
      expect(result).toMatch(/Description: a{500}\.\.\./);
    });

    it("formats prompt with timezone", () => {
      const meetings: MeetingContext[] = [
        {
          eventTitle: "Timezone Test Meeting",
          eventTime: new Date("2024-01-15T10:00:00Z"),
          isPast: true,
        },
      ];

      const result = formatMeetingContextForPrompt(
        meetings,
        "America/New_York",
      );

      // Readable prompt text:
      console.log("Prompt:", result);

      expect(result).toContain("Timezone Test Meeting");
      expect(result).toContain("recent_meetings");
    });

    it("handles meetings without description or location", () => {
      const meetings: MeetingContext[] = [
        {
          eventTitle: "Simple Meeting",
          eventTime: new Date("2024-01-15T10:00:00Z"),
          isPast: true,
        },
      ];

      const result = formatMeetingContextForPrompt(meetings);

      // Readable prompt text:
      console.log("Prompt:", result);

      expect(result).toBe(`You have meeting history with this person:

<recent_meetings>
- "Simple Meeting" on Monday, January 15 at 10:00 AM
</recent_meetings>

Use this context naturally if relevant. For past meetings, you might reference topics discussed.`);
    });
  });

  describe("getMeetingContext", () => {
    it("returns empty array when no calendar providers", async () => {
      vi.mocked(createCalendarEventProviders).mockResolvedValue([]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        logger,
      });

      expect(result).toEqual([]);
    });

    it("fetches and filters past and upcoming meetings", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      const pastEvent: CalendarEvent = {
        id: "past-1",
        title: "Past Meeting",
        description: "Past meeting description",
        location: "Office",
        startTime: pastDate,
        endTime: new Date(pastDate.getTime() + 60 * 60 * 1000),
        attendees: [
          { email: "recipient@example.com", name: "Recipient" },
          { email: "sender@example.com", name: "Sender" },
        ],
      };

      const upcomingEvent: CalendarEvent = {
        id: "upcoming-1",
        title: "Upcoming Meeting",
        description: "Upcoming meeting description",
        startTime: futureDate,
        endTime: new Date(futureDate.getTime() + 60 * 60 * 1000),
        attendees: [
          { email: "recipient@example.com", name: "Recipient" },
          { email: "sender@example.com", name: "Sender" },
        ],
      };

      const mockProvider: CalendarEventProvider = {
        fetchEventsWithAttendee: vi.fn(async ({ timeMax }) => {
          // First call is for past meetings (timeMax <= now)
          if (timeMax <= now) {
            return [pastEvent];
          }
          // Second call is for upcoming meetings (timeMin >= now)
          return [upcomingEvent];
        }),
        fetchEvents: vi.fn(),
      };

      vi.mocked(createCalendarEventProviders).mockResolvedValue([mockProvider]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        logger,
      });

      expect(result).toHaveLength(2);
      expect(result[0].isPast).toBe(true);
      expect(result[1].isPast).toBe(false);
      expect(result[0].eventTitle).toBe("Past Meeting");
      expect(result[1].eventTitle).toBe("Upcoming Meeting");
    });

    it("filters out meetings where not all recipients are attendees", async () => {
      const eventWithAllAttendees: CalendarEvent = {
        id: "event-1",
        title: "Meeting with All",
        startTime: new Date("2024-01-15T10:00:00Z"),
        endTime: new Date("2024-01-15T11:00:00Z"),
        attendees: [
          { email: "recipient@example.com" },
          { email: "cc@example.com" },
          { email: "sender@example.com" },
        ],
      };

      const eventWithoutAllAttendees: CalendarEvent = {
        id: "event-2",
        title: "Private Meeting",
        startTime: new Date("2024-01-16T10:00:00Z"),
        endTime: new Date("2024-01-16T11:00:00Z"),
        attendees: [
          { email: "recipient@example.com" },
          { email: "sender@example.com" },
          // cc@example.com is missing
        ],
      };

      const now = new Date();
      const mockProvider: CalendarEventProvider = {
        fetchEventsWithAttendee: vi.fn(async ({ timeMax }) => {
          // Only return events for past meetings (timeMax <= now)
          // The function calls fetchEventsWithAttendee twice - once for past, once for upcoming
          if (timeMax <= now) {
            return [eventWithAllAttendees, eventWithoutAllAttendees];
          }
          return [];
        }),
        fetchEvents: vi.fn(),
      };

      vi.mocked(createCalendarEventProviders).mockResolvedValue([mockProvider]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        additionalRecipients: ["cc@example.com"],
        logger,
      });

      expect(result).toHaveLength(1);
      expect(result[0].eventTitle).toBe("Meeting with All");
    });

    it("handles provider errors gracefully", async () => {
      const mockProvider: CalendarEventProvider = {
        fetchEventsWithAttendee: vi
          .fn()
          .mockRejectedValue(new Error("API Error")),
        fetchEvents: vi.fn(),
      };

      vi.mocked(createCalendarEventProviders).mockResolvedValue([mockProvider]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        logger,
      });

      expect(result).toEqual([]);
    });

    it("sorts past meetings by most recent first", async () => {
      const olderEvent: CalendarEvent = {
        id: "older",
        title: "Older Meeting",
        startTime: new Date("2024-01-10T10:00:00Z"),
        endTime: new Date("2024-01-10T11:00:00Z"),
        attendees: [{ email: "recipient@example.com" }],
      };

      const newerEvent: CalendarEvent = {
        id: "newer",
        title: "Newer Meeting",
        startTime: new Date("2024-01-15T10:00:00Z"),
        endTime: new Date("2024-01-15T11:00:00Z"),
        attendees: [{ email: "recipient@example.com" }],
      };

      const now = new Date();
      const mockProvider: CalendarEventProvider = {
        fetchEventsWithAttendee: vi.fn(async ({ timeMax }) => {
          // Only return events for past meetings
          if (timeMax <= now) {
            return [olderEvent, newerEvent];
          }
          return [];
        }),
        fetchEvents: vi.fn(),
      };

      vi.mocked(createCalendarEventProviders).mockResolvedValue([mockProvider]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        logger,
      });

      expect(result).toHaveLength(2);
      expect(result[0].eventTitle).toBe("Newer Meeting");
      expect(result[1].eventTitle).toBe("Older Meeting");
    });

    it("sorts upcoming meetings by soonest first", async () => {
      const laterEvent: CalendarEvent = {
        id: "later",
        title: "Later Meeting",
        startTime: new Date("2024-02-05T14:00:00Z"),
        endTime: new Date("2024-02-05T15:00:00Z"),
        attendees: [{ email: "recipient@example.com" }],
      };

      const soonerEvent: CalendarEvent = {
        id: "sooner",
        title: "Sooner Meeting",
        startTime: new Date("2024-02-01T10:00:00Z"),
        endTime: new Date("2024-02-01T11:00:00Z"),
        attendees: [{ email: "recipient@example.com" }],
      };

      const now = new Date();
      const mockProvider: CalendarEventProvider = {
        fetchEventsWithAttendee: vi.fn(async ({ timeMin }) => {
          // Only return events for upcoming meetings (timeMin >= now)
          if (timeMin >= now) {
            return [laterEvent, soonerEvent];
          }
          return [];
        }),
        fetchEvents: vi.fn(),
      };

      vi.mocked(createCalendarEventProviders).mockResolvedValue([mockProvider]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        logger,
      });

      expect(result).toHaveLength(2);
      expect(result[0].eventTitle).toBe("Sooner Meeting");
      expect(result[1].eventTitle).toBe("Later Meeting");
    });

    it("limits results to MAX_MEETINGS_PER_CATEGORY", async () => {
      const pastEvents: CalendarEvent[] = Array.from(
        { length: 10 },
        (_, i) => ({
          id: `past-event-${i}`,
          title: `Past Meeting ${i}`,
          startTime: new Date(`2024-01-${15 + i}T10:00:00Z`),
          endTime: new Date(`2024-01-${15 + i}T11:00:00Z`),
          attendees: [{ email: "recipient@example.com" }],
        }),
      );

      const now = new Date();
      const mockProvider: CalendarEventProvider = {
        fetchEventsWithAttendee: vi.fn(async ({ timeMax }) => {
          // Return past events when fetching past meetings
          if (timeMax <= now) {
            return pastEvents;
          }
          return [];
        }),
        fetchEvents: vi.fn(),
      };

      vi.mocked(createCalendarEventProviders).mockResolvedValue([mockProvider]);

      const result = await getMeetingContext({
        emailAccountId: "test-account-id",
        recipientEmail: "recipient@example.com",
        logger,
      });

      // Should be limited to MAX_MEETINGS_PER_CATEGORY (5) per category
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});
