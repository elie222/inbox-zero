import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";

const graphMocks = vi.hoisted(() => ({
  api: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/utils/outlook/calendar-client", () => ({
  getCalendarClientWithRefresh: vi.fn(async () => ({
    api: graphMocks.api,
  })),
}));

describe("MicrosoftCalendarEventProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphMocks.api.mockReturnValue({
      post: graphMocks.post,
    });
  });

  it("creates Teams meetings for Microsoft Teams locations", async () => {
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      onlineMeeting: { joinUrl: "https://teams.example.com/join" },
      webLink: "https://outlook.example.com/event",
    });

    const provider = new MicrosoftCalendarEventProvider(
      {
        accessToken: "access-token",
        emailAccountId: "email-account-id",
        expiresAt: null,
        refreshToken: "refresh-token",
      },
      createTestLogger(),
    );

    const result = await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "MICROSOFT_TEAMS",
      locationValue: "Ignored room",
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    expect(graphMocks.api).toHaveBeenCalledWith(
      "/me/calendars/calendar-id/events",
    );
    expect(graphMocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
        location: undefined,
        start: {
          dateTime: "2026-05-04T09:00:00.0000000",
          timeZone: "UTC",
        },
        end: {
          dateTime: "2026-05-04T09:30:00.0000000",
          timeZone: "UTC",
        },
      }),
    );
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: "https://teams.example.com/join",
    });
  });

  it("cancels events through the Graph cancel action so attendees are notified", async () => {
    const provider = new MicrosoftCalendarEventProvider(
      {
        accessToken: "access-token",
        emailAccountId: "email-account-id",
        expiresAt: null,
        refreshToken: "refresh-token",
      },
      createTestLogger(),
    );

    await provider.cancelEvent({
      calendarId: "calendar-id",
      eventId: "event-id",
    });

    expect(graphMocks.api).toHaveBeenCalledWith("/me/events/event-id/cancel");
    expect(graphMocks.post).toHaveBeenCalledWith({ comment: "" });
  });
});
