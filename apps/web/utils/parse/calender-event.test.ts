import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeCalendarEvent, isCalendarEventInPast } from "./calender-event";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));

describe("Calendar Event Detection", () => {
  beforeEach(() => {
    // Set fixed date to March 15, 2024
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("analyzeCalendarEvent", () => {
    it("should detect calendar events from Google Calendar invites", () => {
      const email = createTestEmail({
        headers: {
          subject:
            "Updated invitation: Team Meeting @ Weekly from 10:00 to 11:00",
          from: "calendar-notification@google.com",
          to: "user@example.com",
          date: "2024-03-06T00:26:01Z",
        },
        textHtml: `
          BEGIN:VCALENDAR
          DTSTART;TZID=America/New_York:20250210T090000
          DTEND;TZID=America/New_York:20250210T100000
          RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20250303T045959Z;INTERVAL=1;BYDAY=MO
          ORGANIZER;CN=organizer@example.com:mailto:organizer@example.com
        `,
        textPlain: "Team weekly sync meeting",
      });

      const result = analyzeCalendarEvent(email);
      expect(result.isCalendarEvent).toBe(true);
      expect(result.recurringEvent).toBe(true);
      expect(result.eventTitle).toBe("Team Meeting");
    });

    it("should detect calendar events from plain text with calendar keywords", () => {
      const email = createTestEmail({
        headers: {
          subject: "Meeting Invitation: Project Review",
          from: "sender@example.com",
          to: "user@example.com",
          date: "2024-03-06T00:26:01Z",
        },
        textHtml: `
          Please join us for a project review meeting
          When: Monday, March 10, 2024 at 2:00 PM
          Where: Conference Room A
          
          Yes | No | Maybe
        `,
        textPlain: "Project review meeting invitation",
      });

      const result = analyzeCalendarEvent(email);
      expect(result.isCalendarEvent).toBe(true);
      expect(result.eventTitle).toBe("Meeting Invitation: Project Review");
    });

    it("should not detect regular emails as calendar events", () => {
      const email = createTestEmail({
        headers: {
          subject: "Hello there",
          from: "friend@example.com",
          to: "user@example.com",
          date: "2024-03-06T00:26:01Z",
        },
        textHtml: "Just wanted to say hi!",
        textPlain: "Just wanted to say hi!",
      });

      const result = analyzeCalendarEvent(email);
      expect(result.isCalendarEvent).toBe(false);
      expect(result.eventDate).toBeUndefined();
    });

    it("should extract event dates from iCalendar data", () => {
      const email = createTestEmail({
        headers: {
          subject: "Calendar Event",
          from: "organizer@example.com",
          to: "user@example.com",
          date: "2024-03-06T00:26:01Z",
        },
        textHtml: `
          BEGIN:VCALENDAR
          DTSTART:20240315T140000Z
          DTEND:20240315T150000Z
          ORGANIZER:mailto:organizer@example.com
        `,
        textPlain: "Calendar event details",
      });

      const result = analyzeCalendarEvent(email);
      expect(result.isCalendarEvent).toBe(true);
      expect(result.eventDate).toBeInstanceOf(Date);
      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });
  });

  describe("isCalendarEventInPast", () => {
    it("should return true for events in the past", () => {
      const pastEvent = createTestEmail({
        headers: {
          subject: "Team Meeting",
          from: "organizer@example.com",
          to: "attendee@example.com",
          date: "",
        },
        textHtml: `
          BEGIN:VCALENDAR
          DTSTART:20240301T100000Z
          DTEND:20240301T110000Z
          END:VCALENDAR
        `,
      });

      expect(isCalendarEventInPast(pastEvent)).toBe(true);
    });

    it("should return false for events in the future", () => {
      const futureEvent = createTestEmail({
        headers: {
          subject: "Team Meeting",
          from: "organizer@example.com",
          to: "attendee@example.com",
          date: "",
        },
        textHtml: `
          BEGIN:VCALENDAR
          DTSTART:20240401T100000Z
          DTEND:20240401T110000Z
          END:VCALENDAR
        `,
      });

      expect(isCalendarEventInPast(futureEvent)).toBe(false);
    });

    it("should return false for non-calendar events", () => {
      const regularEmail = createTestEmail({
        headers: {
          subject: "Regular Email",
          from: "sender@example.com",
          to: "recipient@example.com",
          date: "",
        },
        textHtml: "This is a regular email without calendar information",
      });

      expect(isCalendarEventInPast(regularEmail)).toBe(false);
    });
  });
});

const createTestEmail = (
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage => ({
  id: "test-id",
  threadId: "test-thread-id",
  historyId: "test-history-id",
  snippet: "",
  headers: {
    subject: "",
    from: "",
    to: "",
    date: "",
  },
  textHtml: "",
  inline: [],
  ...overrides,
});
