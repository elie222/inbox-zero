import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";

const graphMocks = vi.hoisted(() => ({
  api: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/utils/outlook/calendar-client", () => ({
  getCalendarClientWithRefresh: vi.fn(async () => ({
    api: graphMocks.api,
  })),
}));

describe("MicrosoftCalendarEventProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphMocks.select.mockReturnValue({
      get: graphMocks.get,
    });
    graphMocks.api.mockReturnValue({
      get: graphMocks.get,
      patch: graphMocks.patch,
      post: graphMocks.post,
      select: graphMocks.select,
    });
  });

  it("creates Teams meetings for Microsoft Teams locations", async () => {
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["teamsForBusiness"],
      defaultOnlineMeetingProvider: "teamsForBusiness",
    });
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      onlineMeeting: { joinUrl: "https://teams.example.com/join" },
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

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

    expect(graphMocks.api).toHaveBeenCalledWith("/me/calendars/calendar-id");
    expect(graphMocks.select).toHaveBeenCalledWith(
      "id,allowedOnlineMeetingProviders,defaultOnlineMeetingProvider",
    );
    expect(graphMocks.api).toHaveBeenCalledWith(
      "/me/calendars/calendar-id/events",
    );
    const createPayload = graphMocks.post.mock.calls[0]?.[0];
    expect(createPayload).toEqual(
      expect.objectContaining({
        isOnlineMeeting: true,
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
    expect(createPayload).not.toHaveProperty("onlineMeetingProvider");
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: "https://teams.example.com/join",
    });
  });

  it("omits the explicit Teams provider when Teams is the calendar default", async () => {
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["teamsForBusiness"],
      defaultOnlineMeetingProvider: "teamsForBusiness",
    });
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      onlineMeeting: { joinUrl: "https://teams.example.com/join" },
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

    await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "MICROSOFT_TEAMS",
      locationValue: null,
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    const createPayload = graphMocks.post.mock.calls[0]?.[0];
    expect(createPayload).toEqual(
      expect.objectContaining({ isOnlineMeeting: true }),
    );
    expect(createPayload).not.toHaveProperty("onlineMeetingProvider");
  });

  it("refetches the event when Graph initializes the Teams join URL asynchronously", async () => {
    // Graph sometimes returns the created event before onlineMeeting is
    // populated; a follow-up GET on the event resolves to the join URL.
    graphMocks.get
      .mockResolvedValueOnce({
        id: "calendar-id",
        allowedOnlineMeetingProviders: ["teamsForBusiness"],
        defaultOnlineMeetingProvider: "teamsForBusiness",
      })
      .mockResolvedValueOnce({
        id: "event-id",
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
        onlineMeeting: { joinUrl: "https://teams.example.com/join" },
        webLink: "https://outlook.example.com/event",
      });
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      onlineMeeting: null,
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

    const result = await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "MICROSOFT_TEAMS",
      locationValue: null,
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    expect(graphMocks.api).toHaveBeenCalledWith(
      "/me/calendars/calendar-id/events",
    );
    expect(graphMocks.api).toHaveBeenCalledWith("/me/events/event-id");
    expect(graphMocks.get).toHaveBeenCalled();
    expect(result.videoConferenceLink).toBe("https://teams.example.com/join");
  });

  it("patches the event when Teams join URL is still missing after refetch", async () => {
    graphMocks.get
      .mockResolvedValueOnce({
        id: "calendar-id",
        allowedOnlineMeetingProviders: ["teamsForBusiness"],
        defaultOnlineMeetingProvider: "teamsForBusiness",
      })
      .mockResolvedValueOnce({
        id: "event-id",
        isOnlineMeeting: false,
        onlineMeetingProvider: "unknown",
        onlineMeeting: null,
        webLink: "https://outlook.example.com/event",
      });
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      isOnlineMeeting: false,
      onlineMeetingProvider: "unknown",
      onlineMeeting: null,
      webLink: "https://outlook.example.com/event",
    });
    graphMocks.patch.mockResolvedValue({
      id: "event-id",
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      onlineMeeting: { joinUrl: "https://teams.example.com/join" },
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

    const result = await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "MICROSOFT_TEAMS",
      locationValue: null,
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    expect(graphMocks.api).toHaveBeenCalledWith("/me/events/event-id");
    expect(graphMocks.patch).toHaveBeenCalledWith({
      isOnlineMeeting: true,
    });
    expect(result.videoConferenceLink).toBe("https://teams.example.com/join");
  });

  it("creates a regular event when the destination calendar does not support Teams", async () => {
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["skypeForBusiness"],
      defaultOnlineMeetingProvider: "skypeForBusiness",
    });
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

    const result = await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "MICROSOFT_TEAMS",
      locationValue: null,
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    const createPayload = graphMocks.post.mock.calls[0]?.[0];
    expect(createPayload).not.toHaveProperty("isOnlineMeeting");
    expect(createPayload).not.toHaveProperty("onlineMeetingProvider");
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: undefined,
    });
  });

  it("creates a regular event when Teams is not the calendar default", async () => {
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["teamsForBusiness", "skypeForBusiness"],
      defaultOnlineMeetingProvider: "skypeForBusiness",
    });
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

    const result = await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "MICROSOFT_TEAMS",
      locationValue: null,
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    const createPayload = graphMocks.post.mock.calls[0]?.[0];
    expect(createPayload).not.toHaveProperty("isOnlineMeeting");
    expect(createPayload).not.toHaveProperty("onlineMeetingProvider");
    expect(graphMocks.api).not.toHaveBeenCalledWith("/me/events/event-id");
    expect(graphMocks.patch).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: undefined,
    });
  });

  it("keeps the Outlook event when Graph creates it without a Teams link", async () => {
    vi.useFakeTimers();
    try {
      graphMocks.get
        .mockResolvedValueOnce({
          id: "calendar-id",
          allowedOnlineMeetingProviders: ["teamsForBusiness"],
          defaultOnlineMeetingProvider: "teamsForBusiness",
        })
        .mockResolvedValue({
          id: "event-id",
          isOnlineMeeting: false,
          onlineMeetingProvider: "unknown",
          onlineMeeting: null,
          webLink: "https://outlook.example.com/event",
        });
      graphMocks.post.mockResolvedValue({
        id: "event-id",
        isOnlineMeeting: false,
        onlineMeetingProvider: "unknown",
        onlineMeeting: null,
        webLink: "https://outlook.example.com/event",
      });
      graphMocks.patch.mockResolvedValue({
        id: "event-id",
        isOnlineMeeting: false,
        onlineMeetingProvider: "unknown",
        onlineMeeting: null,
        webLink: "https://outlook.example.com/event",
      });

      const provider = createProvider();

      const promise = provider.createEvent({
        attendees: [{ email: "guest@example.com", name: "Guest User" }],
        calendarId: "calendar-id",
        description: "Meeting description",
        endTime: new Date("2026-05-04T09:30:00.000Z"),
        locationType: "MICROSOFT_TEAMS",
        locationValue: null,
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        timezone: "America/New_York",
        title: "Intro call",
      });

      const assertion = expect(promise).resolves.toEqual({
        id: "event-id",
        providerCalendarId: "calendar-id",
        eventUrl: "https://outlook.example.com/event",
        videoConferenceLink: undefined,
      });
      await vi.runAllTimersAsync();
      await assertion;
      expect(graphMocks.api).not.toHaveBeenCalledWith(
        "/me/events/event-id/cancel",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not refetch when Teams was not requested", async () => {
    graphMocks.post.mockResolvedValue({
      id: "event-id",
      webLink: "https://outlook.example.com/event",
    });

    const provider = createProvider();

    await provider.createEvent({
      attendees: [{ email: "guest@example.com", name: "Guest User" }],
      calendarId: "calendar-id",
      description: "Meeting description",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "CUSTOM",
      locationValue: "Office",
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    expect(graphMocks.get).not.toHaveBeenCalled();
  });

  it("cancels events through the Graph cancel action so attendees are notified", async () => {
    const provider = createProvider();

    await provider.cancelEvent({
      calendarId: "calendar-id",
      eventId: "event-id",
    });

    expect(graphMocks.api).toHaveBeenCalledWith("/me/events/event-id/cancel");
    expect(graphMocks.post).toHaveBeenCalledWith({ comment: "" });
  });
});

function createProvider() {
  return new MicrosoftCalendarEventProvider(
    {
      accessToken: "access-token",
      emailAccountId: "email-account-id",
      expiresAt: null,
      refreshToken: "refresh-token",
    },
    createTestLogger(),
  );
}
