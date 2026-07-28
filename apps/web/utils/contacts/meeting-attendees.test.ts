import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import prisma from "@/utils/__mocks__/prisma";
import { getMeetingAttendeeSuggestions } from "./meeting-attendees";

const fetchEvents = vi.fn();

vi.mock("@/utils/prisma");
vi.mock("@/utils/calendar/event-provider", () => ({
  createCalendarEventProviders: vi.fn(async () => [{ fetchEvents }]),
}));

const logger = createTestLogger();
const USER_EMAIL = "chris@nucar.com";

describe("getMeetingAttendeeSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.contact.findMany.mockResolvedValue([] as never);
    prisma.emailAccount.findUnique.mockResolvedValue({
      ignoredContactEmails: [],
      ignoredContactDomains: [],
    } as never);
  });

  it("returns attendees with how often and how recently you met", async () => {
    fetchEvents.mockResolvedValue([
      event({
        title: "Kickoff",
        startTime: new Date("2026-07-01"),
        attendees: [{ email: "alex@partner.com", name: "Alex Bois" }],
      }),
      event({
        title: "Follow-up",
        startTime: new Date("2026-07-20"),
        attendees: [{ email: "alex@partner.com", name: "Alex Bois" }],
      }),
    ]);

    const [alex] = await suggestions();

    expect(alex).toMatchObject({
      email: "alex@partner.com",
      name: "Alex Bois",
      domain: "partner.com",
      meetingCount: 2,
      lastMeetingTitle: "Follow-up",
    });
    expect(alex.lastMetAt).toEqual(new Date("2026-07-20"));
  });

  it("never suggests the user themselves", async () => {
    fetchEvents.mockResolvedValue([
      event({ attendees: [{ email: USER_EMAIL }, { email: "a@partner.com" }] }),
    ]);

    const result = await suggestions();

    expect(result.map((entry) => entry.email)).toEqual(["a@partner.com"]);
  });

  // The whole point is people you don't have yet
  it("leaves out people already saved as contacts", async () => {
    prisma.contact.findMany.mockResolvedValue([
      { email: "known@partner.com" },
    ] as never);
    fetchEvents.mockResolvedValue([
      event({
        attendees: [
          { email: "Known@Partner.com" },
          { email: "new@partner.com" },
        ],
      }),
    ]);

    const result = await suggestions();

    expect(result.map((entry) => entry.email)).toEqual(["new@partner.com"]);
  });

  it("respects ignored addresses and domains", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ignoredContactEmails: ["nope@partner.com"],
      ignoredContactDomains: ["vendor.com"],
    } as never);
    fetchEvents.mockResolvedValue([
      event({
        attendees: [
          { email: "nope@partner.com" },
          { email: "someone@vendor.com" },
          { email: "keep@partner.com" },
        ],
      }),
    ]);

    const result = await suggestions();

    expect(result.map((entry) => entry.email)).toEqual(["keep@partner.com"]);
  });

  // People change how their name appears; the newest invite is the one to save
  it("prefers the name from the most recent meeting", async () => {
    fetchEvents.mockResolvedValue([
      event({
        startTime: new Date("2026-07-20"),
        attendees: [{ email: "alex@partner.com", name: "Alex Bois" }],
      }),
      event({
        startTime: new Date("2026-07-01"),
        attendees: [{ email: "alex@partner.com", name: "A. Bois" }],
      }),
    ]);

    const [alex] = await suggestions();

    expect(alex.name).toBe("Alex Bois");
  });

  it("sorts the most recently met first", async () => {
    fetchEvents.mockResolvedValue([
      event({
        startTime: new Date("2026-07-01"),
        attendees: [{ email: "older@partner.com" }],
      }),
      event({
        startTime: new Date("2026-07-25"),
        attendees: [{ email: "newer@partner.com" }],
      }),
    ]);

    const result = await suggestions();

    expect(result.map((entry) => entry.email)).toEqual([
      "newer@partner.com",
      "older@partner.com",
    ]);
  });

  it("returns nothing when no calendar is connected", async () => {
    const { createCalendarEventProviders } = await import(
      "@/utils/calendar/event-provider"
    );
    vi.mocked(createCalendarEventProviders).mockResolvedValueOnce([]);

    expect(await suggestions()).toEqual([]);
    expect(fetchEvents).not.toHaveBeenCalled();
  });

  // One broken calendar shouldn't lose the people on the others
  it("keeps going when a calendar fails", async () => {
    const { createCalendarEventProviders } = await import(
      "@/utils/calendar/event-provider"
    );
    vi.mocked(createCalendarEventProviders).mockResolvedValueOnce([
      { fetchEvents: vi.fn().mockRejectedValue(new Error("token expired")) },
      {
        fetchEvents: vi
          .fn()
          .mockResolvedValue([
            event({ attendees: [{ email: "alex@partner.com" }] }),
          ]),
      },
    ] as never);

    const result = await suggestions();

    expect(result.map((entry) => entry.email)).toEqual(["alex@partner.com"]);
  });
});

function suggestions() {
  return getMeetingAttendeeSuggestions({
    emailAccountId: "email-account-1",
    userEmail: USER_EMAIL,
    logger,
  });
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    title: "Meeting",
    startTime: new Date("2026-07-15"),
    endTime: new Date("2026-07-15"),
    attendees: [],
    ...overrides,
  };
}
