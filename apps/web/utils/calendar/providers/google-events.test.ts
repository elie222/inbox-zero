import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { GoogleCalendarEventProvider } from "@/utils/calendar/providers/google-events";

const calendarMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@/utils/calendar/client", () => ({
  getCalendarClientWithRefresh: vi.fn(async () => ({
    events: { list: calendarMocks.list },
  })),
}));

describe("GoogleCalendarEventProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses the organizer and declined attendees when fetching events", async () => {
    calendarMocks.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "event-id",
            summary: "Sync",
            organizer: { email: "Host@Example.com", self: true },
            start: { dateTime: "2026-05-04T09:00:00.000Z" },
            end: { dateTime: "2026-05-04T09:30:00.000Z" },
            attendees: [
              {
                email: "guest@example.com",
                displayName: "Guest",
                responseStatus: "accepted",
              },
              {
                email: "busy@example.com",
                displayName: "Busy",
                responseStatus: "declined",
              },
            ],
          },
        ],
      },
    });

    const provider = createProvider();

    const events = await provider.fetchEvents({
      timeMin: new Date("2026-05-04T00:00:00.000Z"),
      timeMax: new Date("2026-05-05T00:00:00.000Z"),
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        isOrganizer: true,
        organizerEmail: "Host@Example.com",
        attendees: [
          { email: "guest@example.com", name: "Guest", declined: false },
          { email: "busy@example.com", name: "Busy", declined: true },
        ],
      }),
    );
  });

  it("finds the video link for an accepted invitation", async () => {
    calendarMocks.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "invited-event-id",
            summary: "Customer call",
            description:
              "Join Zoom Meeting\nhttps://acme.zoom.us/j/8123456789?pwd=secret",
            organizer: { email: "host@example.com", self: false },
            start: { dateTime: "2026-05-04T09:00:00.000Z" },
            end: { dateTime: "2026-05-04T09:30:00.000Z" },
            attendees: [
              {
                email: "user@example.com",
                self: true,
                responseStatus: "accepted",
              },
            ],
          },
        ],
      },
    });

    const events = await createProvider().fetchEvents({
      timeMin: new Date("2026-05-04T00:00:00.000Z"),
      timeMax: new Date("2026-05-05T00:00:00.000Z"),
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        isOrganizer: false,
        videoConferenceLink: "https://acme.zoom.us/j/8123456789?pwd=secret",
      }),
    );
  });
});

function createProvider() {
  return new GoogleCalendarEventProvider(
    {
      accessToken: "access-token",
      connectionId: "connection-id",
      emailAccountId: "email-account-id",
      expiresAt: null,
      refreshToken: "refresh-token",
    },
    createTestLogger(),
  );
}
