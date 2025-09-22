/** biome-ignore-all lint/style/noMagicNumbers: test */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiGetCalendarAvailability } from "@/utils/ai/calendar/availability";
import type { EmailForLLM } from "@/utils/types";
import { getEmailAccount } from "@/__tests__/helpers";
import type { BusyPeriod } from "@/utils/calendar/availability";
import type { Prisma } from "@prisma/client";

// Run with: pnpm test-ai calendar-availability

vi.mock("server-only", () => ({}));

const TIMEOUT = 15_000;

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

type CalendarConnectionWithCalendars = Prisma.CalendarConnectionGetPayload<{
  include: {
    calendars: {
      select: {
        calendarId: true;
        timezone: true;
        primary: true;
      };
    };
  };
}>;

// Mock the calendar availability function
vi.mock("@/utils/calendar/availability", () => ({
  getCalendarAvailability: vi.fn(),
}));

// Mock Prisma
vi.mock("@/utils/prisma", () => ({
  default: {
    calendarConnection: {
      findMany: vi.fn(),
    },
  },
}));

function getMockEmailForLLM(overrides = {}): EmailForLLM {
  return {
    id: "msg1",
    from: "sender@test.com",
    subject: "Meeting Request",
    content: "Let's schedule a meeting to discuss the project.",
    date: new Date("2024-03-20T10:00:00Z"),
    to: "user@test.com",
    ...overrides,
  };
}

function getSchedulingMessages() {
  return [
    getMockEmailForLLM({
      id: "msg1",
      subject: "Meeting Request - Project Discussion",
      content:
        "Hi, I'd like to schedule a meeting with you to discuss the upcoming project. Are you available next Tuesday or Wednesday afternoon?",
      from: "client@example.com",
    }),
    getMockEmailForLLM({
      id: "msg2",
      subject: "Re: Meeting Request - Project Discussion",
      content:
        "Thanks for reaching out! I'm generally available in the afternoons. What time works best for you?",
      from: "user@test.com",
    }),
  ];
}

function getNonSchedulingMessages() {
  return [
    getMockEmailForLLM({
      id: "msg1",
      subject: "Project Update",
      content:
        "Here's the latest update on the project status. Everything is progressing well.",
      from: "team@example.com",
    }),
  ];
}

function getMockCalendarConnections(): CalendarConnectionWithCalendars[] {
  return [
    {
      id: "conn1",
      createdAt: new Date(),
      updatedAt: new Date(),
      provider: "google",
      email: "user@test.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 3_600_000), // 1 hour from now
      isConnected: true,
      emailAccountId: "email-account-id",
      calendars: [
        { calendarId: "primary", timezone: null, primary: false },
        { calendarId: "work@example.com", timezone: null, primary: false },
      ],
    },
  ];
}

function getMockCalendarConnectionsWithTimezone(
  timezone: string,
): CalendarConnectionWithCalendars[] {
  return [
    {
      id: "conn1",
      createdAt: new Date(),
      updatedAt: new Date(),
      provider: "google",
      email: "user@test.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() + 3_600_000),
      isConnected: true,
      emailAccountId: "email-account-id",
      calendars: [
        { calendarId: "primary", timezone, primary: true },
        { calendarId: "work@example.com", timezone: "UTC", primary: false },
      ],
    },
  ];
}

function getMockBusyPeriods(): BusyPeriod[] {
  return [
    {
      start: "2024-03-26T14:00:00Z",
      end: "2024-03-26T15:00:00Z",
    },
    {
      start: "2024-03-27T10:00:00Z",
      end: "2024-03-27T11:30:00Z",
    },
  ];
}

describe.runIf(isAiTest)("aiGetCalendarAvailability", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mocks
    const prisma = (await import("@/utils/prisma")).default;
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue(
      getMockCalendarConnections(),
    );

    const { getCalendarAvailability } = vi.mocked(
      await import("@/utils/calendar/availability"),
    );
    getCalendarAvailability.mockResolvedValue(getMockBusyPeriods());
  });

  test(
    "successfully analyzes scheduling-related email and returns suggested times",
    async () => {
      const messages = getSchedulingMessages();
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        expect(Array.isArray(result.suggestedTimes)).toBe(true);
        expect(result.suggestedTimes.length).toBeGreaterThan(0);

        // Check that suggested times are in correct format (YYYY-MM-DD HH:MM)
        result.suggestedTimes.forEach((time) => {
          expect(time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        });

        console.debug("Generated suggested times:", result.suggestedTimes);
      }
    },
    TIMEOUT,
  );

  test("returns null for non-scheduling related emails", async () => {
    const messages = getNonSchedulingMessages();
    const emailAccount = getEmailAccount();

    const result = await aiGetCalendarAvailability({
      emailAccount,
      messages,
    });

    // For non-scheduling emails, the AI should not return suggested times
    expect(result).toBeNull();
  });

  test("handles empty messages array", async () => {
    const emailAccount = getEmailAccount();

    const result = await aiGetCalendarAvailability({
      emailAccount,
      messages: [],
    });

    expect(result).toBeNull();
  });

  test("handles messages with no content", async () => {
    const messages = [
      getMockEmailForLLM({
        subject: "",
        content: "",
      }),
    ];
    const emailAccount = getEmailAccount();

    const result = await aiGetCalendarAvailability({
      emailAccount,
      messages,
    });

    expect(result).toBeNull();
  });

  test(
    "works with specific date and time mentions",
    async () => {
      const messages = [
        getMockEmailForLLM({
          subject: "Meeting Tomorrow",
          content:
            "Can we meet tomorrow at 2 PM? I'm also free on Friday at 10 AM if that works better.",
          from: "client@example.com",
        }),
      ];
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        expect(result.suggestedTimes.length).toBeGreaterThan(0);
        console.debug("Specific time suggestions:", result.suggestedTimes);
      }
    },
    TIMEOUT,
  );

  test(
    "handles calendar availability conflicts",
    async () => {
      // Mock busy periods that conflict with requested times
      const { getCalendarAvailability } = vi.mocked(
        await import("@/utils/calendar/availability"),
      );
      getCalendarAvailability.mockResolvedValue([
        {
          start: "2024-03-26T14:00:00Z", // Busy during requested time
          end: "2024-03-26T16:00:00Z",
        },
      ]);

      const messages = [
        getMockEmailForLLM({
          subject: "Meeting Request",
          content: "Are you available Tuesday at 2 PM for a quick meeting?",
          from: "client@example.com",
        }),
      ];
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        // The AI should suggest alternative times when the requested time is busy
        expect(result.suggestedTimes.length).toBeGreaterThan(0);
        console.debug("Alternative time suggestions:", result.suggestedTimes);
      }
    },
    TIMEOUT,
  );

  test("handles no calendar connections", async () => {
    // Mock no calendar connections
    const prisma = (await import("@/utils/prisma")).default;
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);

    const messages = getSchedulingMessages();
    const emailAccount = getEmailAccount();

    const result = await aiGetCalendarAvailability({
      emailAccount,
      messages,
    });

    // Should still work even without calendar connections
    // The AI can still suggest times based on the email content
    expect(result).toBeDefined();
    if (result) {
      expect(result.suggestedTimes).toBeDefined();
      console.debug("Suggestions without calendar:", result.suggestedTimes);
    }
  });

  test(
    "works with user context and about information",
    async () => {
      const messages = getSchedulingMessages();
      const emailAccount = getEmailAccount({
        about:
          "I'm a software engineer who prefers morning meetings and works in PST timezone.",
      });

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        expect(result.suggestedTimes.length).toBeGreaterThan(0);
        console.debug("Context-aware suggestions:", result.suggestedTimes);
      }
    },
    TIMEOUT,
  );

  test(
    "handles multiple calendar connections",
    async () => {
      // Mock multiple calendar connections
      const prisma = (await import("@/utils/prisma")).default;
      const multipleConnections: CalendarConnectionWithCalendars[] = [
        {
          id: "conn1",
          createdAt: new Date(),
          updatedAt: new Date(),
          provider: "google",
          email: "user@test.com",
          emailAccountId: "email-account-id",
          isConnected: true,
          accessToken: "access-token-1",
          refreshToken: "refresh-token-1",
          expiresAt: new Date(Date.now() + 3_600_000),
          calendars: [
            { calendarId: "primary", timezone: null, primary: false },
          ],
        },
        {
          id: "conn2",
          createdAt: new Date(),
          updatedAt: new Date(),
          provider: "google",
          email: "work@example.com",
          emailAccountId: "email-account-id",
          isConnected: true,
          accessToken: "access-token-2",
          refreshToken: "refresh-token-2",
          expiresAt: new Date(Date.now() + 3_600_000),
          calendars: [
            { calendarId: "work@example.com", timezone: null, primary: false },
          ],
        },
      ];
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue(
        multipleConnections,
      );

      const messages = getSchedulingMessages();
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        expect(result.suggestedTimes.length).toBeGreaterThan(0);
        console.debug("Multi-calendar suggestions:", result.suggestedTimes);
      }
    },
    TIMEOUT,
  );

  test(
    "handles timezone-aware scheduling with EST timezone",
    async () => {
      // Mock calendar connections with EST timezone
      const prisma = (await import("@/utils/prisma")).default;
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue(
        getMockCalendarConnectionsWithTimezone("America/New_York"),
      );

      const messages = [
        getMockEmailForLLM({
          subject: "Meeting Request - EST timezone",
          content:
            "Can we meet tomorrow at 2 PM EST? I'm available in the afternoon.",
          from: "client@example.com",
        }),
      ];
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        expect(result.suggestedTimes.length).toBeGreaterThan(0);
        console.debug("EST timezone suggestions:", result.suggestedTimes);
      }

      // Verify that getCalendarAvailability was called with the correct timezone
      const { getCalendarAvailability } = vi.mocked(
        await import("@/utils/calendar/availability"),
      );
      expect(getCalendarAvailability).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: "America/New_York",
        }),
      );
    },
    TIMEOUT,
  );

  test(
    "handles timezone-aware scheduling with PST timezone",
    async () => {
      // Mock calendar connections with PST timezone
      const prisma = (await import("@/utils/prisma")).default;
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue(
        getMockCalendarConnectionsWithTimezone("America/Los_Angeles"),
      );

      const messages = [
        getMockEmailForLLM({
          subject: "Meeting Request - PST timezone",
          content:
            "Are you free for a call at 6 PM Pacific time? Let me know what works best.",
          from: "client@example.com",
        }),
      ];
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        expect(result.suggestedTimes.length).toBeGreaterThan(0);
        console.debug("PST timezone suggestions:", result.suggestedTimes);
      }

      // Verify that getCalendarAvailability was called with the correct timezone
      const { getCalendarAvailability } = vi.mocked(
        await import("@/utils/calendar/availability"),
      );
      expect(getCalendarAvailability).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: "America/Los_Angeles",
        }),
      );
    },
    TIMEOUT,
  );

  test(
    "falls back to UTC when no timezone information is available",
    async () => {
      // Mock calendar connections without timezone information
      const prisma = (await import("@/utils/prisma")).default;
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        {
          id: "conn1",
          createdAt: new Date(),
          updatedAt: new Date(),
          provider: "google",
          email: "user@test.com",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: new Date(Date.now() + 3_600_000),
          isConnected: true,
          emailAccountId: "email-account-id",
          calendars: [
            { calendarId: "primary", timezone: null, primary: false },
          ],
        } as CalendarConnectionWithCalendars,
      ]);

      const messages = getSchedulingMessages();
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        console.debug("UTC fallback suggestions:", result.suggestedTimes);
      }

      // Verify that getCalendarAvailability was called with UTC timezone
      const { getCalendarAvailability } = vi.mocked(
        await import("@/utils/calendar/availability"),
      );
      expect(getCalendarAvailability).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: "UTC",
        }),
      );
    },
    TIMEOUT,
  );

  test(
    "uses primary calendar timezone when multiple calendars have different timezones",
    async () => {
      // Mock calendar connections with mixed timezones, primary calendar has EST
      const prisma = (await import("@/utils/prisma")).default;
      vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
        {
          id: "conn1",
          createdAt: new Date(),
          updatedAt: new Date(),
          provider: "google",
          email: "user@test.com",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: new Date(Date.now() + 3_600_000),
          isConnected: true,
          emailAccountId: "email-account-id",
          calendars: [
            {
              calendarId: "primary",
              timezone: "America/New_York",
              primary: true,
            },
            {
              calendarId: "work@example.com",
              timezone: "America/Los_Angeles",
              primary: false,
            },
            {
              calendarId: "personal@example.com",
              timezone: "Europe/London",
              primary: false,
            },
          ],
        } as CalendarConnectionWithCalendars,
      ]);

      const messages = getSchedulingMessages();
      const emailAccount = getEmailAccount();

      const result = await aiGetCalendarAvailability({
        emailAccount,
        messages,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.suggestedTimes).toBeDefined();
        console.debug("Primary timezone suggestions:", result.suggestedTimes);
      }

      // Verify that getCalendarAvailability was called with the primary calendar's timezone
      const { getCalendarAvailability } = vi.mocked(
        await import("@/utils/calendar/availability"),
      );
      expect(getCalendarAvailability).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: "America/New_York",
        }),
      );
    },
    TIMEOUT,
  );
});
