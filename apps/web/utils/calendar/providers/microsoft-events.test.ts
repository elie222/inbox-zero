import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";

const graphMocks = vi.hoisted(() => ({
  api: vi.fn(),
  get: vi.fn(),
  orderby: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  query: vi.fn(),
  select: vi.fn(),
  top: vi.fn(),
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
      query: graphMocks.query,
    });
    graphMocks.query.mockReturnValue({ top: graphMocks.top });
    graphMocks.top.mockReturnValue({ orderby: graphMocks.orderby });
    graphMocks.orderby.mockReturnValue({ get: graphMocks.get });
  });

  it("parses the organizer and declined attendees when fetching events", async () => {
    graphMocks.get.mockResolvedValue({
      value: [
        {
          id: "event-id",
          subject: "Sync",
          isOrganizer: true,
          organizer: { emailAddress: { address: "Host@Example.com" } },
          start: { dateTime: "2026-05-04T09:00:00.000Z" },
          end: { dateTime: "2026-05-04T09:30:00.000Z" },
          attendees: [
            {
              emailAddress: { address: "guest@example.com", name: "Guest" },
              status: { response: "accepted" },
            },
            {
              emailAddress: { address: "busy@example.com", name: "Busy" },
              status: { response: "declined" },
            },
          ],
        },
      ],
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
    const joinUrl =
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%3a%22tenant%22%7d";
    graphMocks.get.mockResolvedValue({
      value: [
        {
          id: "invited-event-id",
          subject: "Customer call",
          isOrganizer: false,
          organizer: { emailAddress: { address: "host@example.com" } },
          start: { dateTime: "2026-05-04T09:00:00.000Z" },
          end: { dateTime: "2026-05-04T09:30:00.000Z" },
          attendees: [
            {
              emailAddress: { address: "user@example.com" },
              status: { response: "accepted" },
            },
          ],
          body: {
            contentType: "html",
            content: `<a href="${joinUrl}">Join Microsoft Teams Meeting</a>`,
          },
        },
      ],
    });

    const events = await createProvider().fetchEvents({
      timeMin: new Date("2026-05-04T00:00:00.000Z"),
      timeMax: new Date("2026-05-05T00:00:00.000Z"),
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        isOrganizer: false,
        videoConferenceLink: joinUrl,
      }),
    );
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

  it("passes the explicit Teams provider when Teams is the calendar default", async () => {
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
      expect.objectContaining({
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      }),
    );
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
      onlineMeetingProvider: "teamsForBusiness",
    });
    expect(result.videoConferenceLink).toBe("https://teams.example.com/join");
  });

  it("creates a Teams meeting via the onlineMeetings API for personal Outlook calendars that exclude teamsForBusiness", async () => {
    const teamsJoinUrl =
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_personal%40thread.v2/0";
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["skypeForConsumer"],
      defaultOnlineMeetingProvider: "skypeForConsumer",
    });
    graphMocks.post
      // First POST: /me/onlineMeetings → Teams meeting
      .mockResolvedValueOnce({ joinWebUrl: teamsJoinUrl })
      // Second POST: /me/calendars/.../events → calendar event
      .mockResolvedValueOnce({
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

    expect(graphMocks.api).toHaveBeenCalledWith("/me/onlineMeetings");
    expect(graphMocks.post).toHaveBeenNthCalledWith(1, {
      startDateTime: "2026-05-04T09:00:00.000Z",
      endDateTime: "2026-05-04T09:30:00.000Z",
      subject: "Intro call",
    });
    // Calendar event must NOT carry isOnlineMeeting/onlineMeetingProvider;
    // the join URL is embedded in the location instead.
    const createPayload = graphMocks.post.mock.calls[1]?.[0];
    expect(createPayload).not.toHaveProperty("isOnlineMeeting");
    expect(createPayload).not.toHaveProperty("onlineMeetingProvider");
    expect(createPayload).toEqual(
      expect.objectContaining({
        location: { displayName: teamsJoinUrl },
      }),
    );
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: teamsJoinUrl,
    });
  });

  it("falls back to the calendar's default provider when the onlineMeetings API is unavailable (no Teams licence)", async () => {
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["skypeForConsumer"],
      defaultOnlineMeetingProvider: "skypeForConsumer",
    });
    graphMocks.post
      // First POST: /me/onlineMeetings → fails (no Teams licence)
      .mockRejectedValueOnce(new Error("403 Forbidden"))
      // Second POST: /me/calendars/.../events → calendar event with Skype
      .mockResolvedValueOnce({
        id: "event-id",
        onlineMeeting: { joinUrl: "https://join.skype.com/example" },
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

    const createPayload = graphMocks.post.mock.calls[1]?.[0];
    expect(createPayload).toEqual(
      expect.objectContaining({
        isOnlineMeeting: true,
        onlineMeetingProvider: "skypeForConsumer",
      }),
    );
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: "https://join.skype.com/example",
    });
  });

  it("prefers Teams when it is allowed but is not the calendar default", async () => {
    graphMocks.get.mockResolvedValue({
      id: "calendar-id",
      allowedOnlineMeetingProviders: ["teamsForBusiness", "skypeForBusiness"],
      defaultOnlineMeetingProvider: "skypeForBusiness",
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
      locationValue: null,
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "America/New_York",
      title: "Intro call",
    });

    const createPayload = graphMocks.post.mock.calls[0]?.[0];
    expect(createPayload).toEqual(
      expect.objectContaining({
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      }),
    );
    expect(result).toEqual({
      id: "event-id",
      providerCalendarId: "calendar-id",
      eventUrl: "https://outlook.example.com/event",
      videoConferenceLink: "https://teams.example.com/join",
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
