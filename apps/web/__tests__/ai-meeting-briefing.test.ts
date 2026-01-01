import { describe, expect, test, vi } from "vitest";
import {
  aiGenerateMeetingBriefing,
  buildPrompt,
  formatMeetingForContext,
  type BriefingContent,
} from "@/utils/ai/meeting-briefs/generate-briefing";
import type { MeetingBriefingData } from "@/utils/meeting-briefs/gather-context";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai ai-meeting-briefing

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));

const logger = createScopedLogger("ai-meeting-briefing-test");

const TIMEOUT = 60_000; // Longer timeout for agentic flow with research

function getCalendarEvent(
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: "event-1",
    title: "Product Discussion",
    description: "Discuss Q1 roadmap and upcoming features",
    startTime: new Date("2025-02-01T10:00:00Z"),
    endTime: new Date("2025-02-01T11:00:00Z"),
    attendees: [
      { email: "user@test.com", name: "Test User" },
      { email: "alice@external.com", name: "Alice External" },
    ],
    ...overrides,
  };
}

function getMeetingBriefingData(
  overrides: Partial<MeetingBriefingData> = {},
): MeetingBriefingData {
  return {
    event: getCalendarEvent(),
    externalGuests: [{ email: "alice@external.com", name: "Alice External" }],
    emailThreads: [],
    pastMeetings: [],
    ...overrides,
  };
}

describe("buildPrompt", () => {
  test("builds prompt with meeting title and description", () => {
    const data = getMeetingBriefingData();
    const prompt = buildPrompt(data, "America/New_York");

    expect(prompt).toContain("Product Discussion");
    expect(prompt).toContain("Q1 roadmap");
  });

  test("includes guest email and name in context", () => {
    const data = getMeetingBriefingData({
      externalGuests: [{ email: "bob@company.com", name: "Bob Smith" }],
    });
    const prompt = buildPrompt(data, null);

    expect(prompt).toContain("bob@company.com");
    expect(prompt).toContain("Bob Smith");
  });

  test("includes no_prior_context tag for guests without history", () => {
    const data = getMeetingBriefingData({
      externalGuests: [{ email: "new@contact.com", name: "New Contact" }],
      emailThreads: [],
      pastMeetings: [],
    });
    const prompt = buildPrompt(data, null);

    expect(prompt).toContain("<no_prior_context>");
    expect(prompt).toContain("new contact");
  });

  test("includes recent emails for guest with email history", () => {
    const mockMessage = getMockMessage({
      from: "alice@external.com",
      to: "user@test.com",
      subject: "Re: Partnership proposal",
      textPlain: "Looking forward to discussing the partnership.",
    });

    const data = getMeetingBriefingData({
      externalGuests: [{ email: "alice@external.com", name: "Alice External" }],
      emailThreads: [
        {
          id: "thread-1",
          snippet: "Looking forward to discussing the partnership.",
          messages: [mockMessage],
        },
      ],
    });
    const prompt = buildPrompt(data, null);

    expect(prompt).toContain("<recent_emails>");
    expect(prompt).toContain("Partnership proposal");
  });

  test("includes past meetings for guest with meeting history", () => {
    const pastMeeting: CalendarEvent = {
      id: "past-event-1",
      title: "Initial Discussion",
      startTime: new Date("2025-01-15T14:00:00Z"),
      endTime: new Date("2025-01-15T15:00:00Z"),
      attendees: [
        { email: "user@test.com" },
        { email: "alice@external.com", name: "Alice External" },
      ],
    };

    const data = getMeetingBriefingData({
      externalGuests: [{ email: "alice@external.com", name: "Alice External" }],
      pastMeetings: [pastMeeting],
    });
    const prompt = buildPrompt(data, "America/New_York");

    expect(prompt).toContain("<recent_meetings>");
    expect(prompt).toContain("Initial Discussion");
  });

  test("handles multiple guests correctly", () => {
    const data = getMeetingBriefingData({
      externalGuests: [
        { email: "alice@acme.com", name: "Alice Smith" },
        { email: "bob@acme.com", name: "Bob Jones" },
      ],
    });
    const prompt = buildPrompt(data, null);

    expect(prompt).toContain("alice@acme.com");
    expect(prompt).toContain("Alice Smith");
    expect(prompt).toContain("bob@acme.com");
    expect(prompt).toContain("Bob Jones");
  });
});

describe("formatMeetingForContext", () => {
  test("formats meeting with title and date", () => {
    const meeting: CalendarEvent = {
      id: "meeting-1",
      title: "Weekly Sync",
      startTime: new Date("2025-01-20T09:00:00Z"),
      endTime: new Date("2025-01-20T10:00:00Z"),
      attendees: [],
    };
    const result = formatMeetingForContext(meeting, "America/New_York");

    expect(result).toContain("<meeting>");
    expect(result).toContain("Weekly Sync");
    expect(result).toContain("</meeting>");
  });

  test("includes description when present", () => {
    const meeting: CalendarEvent = {
      id: "meeting-1",
      title: "Strategy Meeting",
      description: "Review Q2 strategy and goals",
      startTime: new Date("2025-01-20T09:00:00Z"),
      endTime: new Date("2025-01-20T10:00:00Z"),
      attendees: [],
    };
    const result = formatMeetingForContext(meeting, null);

    expect(result).toContain("Q2 strategy");
  });

  test("truncates long descriptions", () => {
    const longDescription = "A".repeat(600);
    const meeting: CalendarEvent = {
      id: "meeting-1",
      title: "Meeting",
      description: longDescription,
      startTime: new Date("2025-01-20T09:00:00Z"),
      endTime: new Date("2025-01-20T10:00:00Z"),
      attendees: [],
    };
    const result = formatMeetingForContext(meeting, null);

    // Description should be truncated to 500 chars
    expect(result.length).toBeLessThan(longDescription.length);
  });
});

describe.runIf(isAiTest)(
  "aiGenerateMeetingBriefing",
  () => {
    test("generates briefing for single guest with no prior context", async () => {
      // Add minimal email context so test doesn't rely solely on research API
      const mockMessage = getMockMessage({
        from: "new.person@example.com",
        to: "user@test.com",
        subject: "Looking forward to our coffee chat",
        textPlain:
          "Hi! Excited to meet tomorrow. I work as a product manager at TechCo.",
      });

      const data = getMeetingBriefingData({
        event: getCalendarEvent({
          title: "Coffee Chat",
          description: "Casual catch-up",
        }),
        externalGuests: [
          { email: "new.person@example.com", name: "New Person" },
        ],
        emailThreads: [
          {
            id: "thread-1",
            snippet: "Looking forward to our coffee chat",
            messages: [mockMessage],
          },
        ],
        pastMeetings: [],
      });

      const result = await aiGenerateMeetingBriefing({
        briefingData: data,
        emailAccount: getEmailAccount(),
        logger,
      });

      prettyPrintBriefing(result, data.event.title);

      expect(result.guests).toHaveLength(1);
      expect(result.guests[0].email).toBe("new.person@example.com");
      expect(result.guests[0].bullets).toBeDefined();
      expect(result.guests[0].bullets.length).toBeGreaterThan(0);
    });

    test("generates briefing for guest with email history", async () => {
      const mockMessage = getMockMessage({
        from: "partner@startup.io",
        to: "user@test.com",
        subject: "Partnership Proposal",
        textPlain:
          "Hi, we'd like to discuss a potential partnership between our companies. We specialize in AI automation tools.",
      });

      const data = getMeetingBriefingData({
        event: getCalendarEvent({
          title: "Partnership Discussion",
          description: "Follow up on partnership proposal",
          attendees: [
            { email: "user@test.com" },
            { email: "partner@startup.io", name: "Partner Person" },
          ],
        }),
        externalGuests: [
          { email: "partner@startup.io", name: "Partner Person" },
        ],
        emailThreads: [
          {
            id: "thread-1",
            snippet: "Partnership proposal",
            messages: [mockMessage],
          },
        ],
        pastMeetings: [],
      });

      const result = await aiGenerateMeetingBriefing({
        briefingData: data,
        emailAccount: getEmailAccount(),
        logger,
      });

      prettyPrintBriefing(result, data.event.title);

      expect(result.guests).toHaveLength(1);
      expect(result.guests[0].email).toBe("partner@startup.io");
      // Should reference partnership or the email context
      const bulletText = result.guests[0].bullets.join(" ").toLowerCase();
      expect(
        bulletText.includes("partnership") ||
          bulletText.includes("ai") ||
          bulletText.includes("automation"),
      ).toBe(true);
    });

    test("generates briefing for multiple guests from same company", async () => {
      const data = getMeetingBriefingData({
        event: getCalendarEvent({
          title: "Team Sync with Acme Corp",
          description: "Quarterly review with Acme team",
          attendees: [
            { email: "user@test.com" },
            { email: "alice@acme.com", name: "Alice CEO" },
            { email: "bob@acme.com", name: "Bob CTO" },
          ],
        }),
        externalGuests: [
          { email: "alice@acme.com", name: "Alice CEO" },
          { email: "bob@acme.com", name: "Bob CTO" },
        ],
        emailThreads: [],
        pastMeetings: [],
      });

      const result = await aiGenerateMeetingBriefing({
        briefingData: data,
        emailAccount: getEmailAccount(),
        logger,
      });

      prettyPrintBriefing(result, data.event.title);

      expect(result.guests).toHaveLength(2);

      const guestEmails = result.guests.map((g) => g.email);
      expect(guestEmails).toContain("alice@acme.com");
      expect(guestEmails).toContain("bob@acme.com");

      // Each guest should have bullets
      for (const guest of result.guests) {
        expect(guest.bullets.length).toBeGreaterThan(0);
      }
    });

    test("generates briefing with past meeting context", async () => {
      const pastMeeting: CalendarEvent = {
        id: "past-1",
        title: "Initial Product Demo",
        description: "Showed the main features of our platform",
        startTime: new Date("2025-01-10T15:00:00Z"),
        endTime: new Date("2025-01-10T16:00:00Z"),
        attendees: [
          { email: "user@test.com" },
          { email: "prospect@bigcorp.com", name: "Prospect Lead" },
        ],
      };

      // Add email context so test doesn't rely solely on research API
      const mockMessage = getMockMessage({
        from: "prospect@bigcorp.com",
        to: "user@test.com",
        subject: "Thanks for the demo!",
        textPlain:
          "Great demo yesterday. Looking forward to seeing the enterprise features.",
      });

      const data = getMeetingBriefingData({
        event: getCalendarEvent({
          title: "Follow-up Demo",
          description: "Deep dive into enterprise features",
          attendees: [
            { email: "user@test.com" },
            { email: "prospect@bigcorp.com", name: "Prospect Lead" },
          ],
        }),
        externalGuests: [
          { email: "prospect@bigcorp.com", name: "Prospect Lead" },
        ],
        emailThreads: [
          {
            id: "thread-1",
            snippet: "Thanks for the demo!",
            messages: [mockMessage],
          },
        ],
        pastMeetings: [pastMeeting],
      });

      const result = await aiGenerateMeetingBriefing({
        briefingData: data,
        emailAccount: getEmailAccount(),
        logger,
      });

      prettyPrintBriefing(result, data.event.title);

      expect(result.guests).toHaveLength(1);
      expect(result.guests[0].email).toBe("prospect@bigcorp.com");

      // Should reference the past meeting or demo
      const bulletText = result.guests[0].bullets.join(" ").toLowerCase();
      expect(
        bulletText.includes("demo") ||
          bulletText.includes("product") ||
          bulletText.includes("meeting") ||
          bulletText.includes("previous") ||
          bulletText.includes("enterprise"),
      ).toBe(true);
    });

    test("returns empty guests array when no external guests", async () => {
      const data = getMeetingBriefingData({
        externalGuests: [],
      });

      const result = await aiGenerateMeetingBriefing({
        briefingData: data,
        emailAccount: getEmailAccount(),
        logger,
      });

      prettyPrintBriefing(result, data.event.title);

      expect(result.guests).toHaveLength(0);
    });

    test("shows full briefing bits that will be used in the email", async () => {
      // Create rich context to see a realistic briefing
      const mockMessage1 = getMockMessage({
        from: "ceo@techstartup.io",
        to: "user@test.com",
        subject: "Partnership Discussion",
        textPlain:
          "Hi! Following up on our call. We're excited about integrating your AI features into our platform. Our team of 50 engineers is ready to start. Let me know about enterprise pricing.",
      });

      const mockMessage2 = getMockMessage({
        id: "msg2",
        from: "user@test.com",
        to: "ceo@techstartup.io",
        subject: "Re: Partnership Discussion",
        textPlain:
          "Thanks for reaching out! Happy to discuss enterprise options. Looking forward to our meeting.",
      });

      const pastMeeting: CalendarEvent = {
        id: "past-1",
        title: "Intro Call with TechStartup",
        description: "Initial discovery call",
        startTime: new Date("2025-01-15T10:00:00Z"),
        endTime: new Date("2025-01-15T10:30:00Z"),
        attendees: [
          { email: "user@test.com" },
          { email: "ceo@techstartup.io", name: "Alex Chen" },
        ],
      };

      const data = getMeetingBriefingData({
        event: getCalendarEvent({
          title: "Partnership Deep Dive with TechStartup",
          description: "Discuss enterprise pricing and integration timeline",
          attendees: [
            { email: "user@test.com", name: "Test User" },
            { email: "ceo@techstartup.io", name: "Alex Chen" },
          ],
        }),
        externalGuests: [{ email: "ceo@techstartup.io", name: "Alex Chen" }],
        emailThreads: [
          {
            id: "thread-1",
            snippet: "Partnership Discussion",
            messages: [mockMessage1, mockMessage2],
          },
        ],
        pastMeetings: [pastMeeting],
      });

      // Generate the briefing
      const result = await aiGenerateMeetingBriefing({
        briefingData: data,
        emailAccount: getEmailAccount(),
        logger,
      });

      prettyPrintBriefing(result, data.event.title);

      expect(result.guests.length).toBeGreaterThan(0);
    });
  },
  TIMEOUT,
);

function prettyPrintBriefing(result: BriefingContent, meetingTitle: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log("BRIEFING OUTPUT (The bits for the email):");
  console.log("=".repeat(80));
  console.log(JSON.stringify(result, null, 2));

  console.log(`\n${"=".repeat(80)}`);
  console.log("HUMAN READABLE VIEW:");
  console.log("=".repeat(80));
  console.log(`Meeting: ${meetingTitle}`);
  console.log("\nGuests:");
  for (const guest of result.guests) {
    console.log(`\n  ${guest.name} (${guest.email})`);
    for (const bullet of guest.bullets) {
      console.log(`    - ${bullet}`);
    }
  }
  console.log(`${"=".repeat(80)}\n`);
}
