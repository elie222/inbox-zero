import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  cancelCalendarEvent,
  createCalendarEvent,
} from "@/utils/calendar/event-writer";

const providerMocks = vi.hoisted(() => ({
  cancelEvent: vi.fn(),
  createEvent: vi.fn(),
  googleConstructor: vi.fn(),
  microsoftConstructor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/calendar/providers/google-events", () => ({
  GoogleCalendarEventProvider: function GoogleCalendarEventProvider(params) {
    providerMocks.googleConstructor(params);
    return {
      cancelEvent: providerMocks.cancelEvent,
      createEvent: providerMocks.createEvent,
    };
  },
}));
vi.mock("@/utils/calendar/providers/microsoft-events", () => ({
  MicrosoftCalendarEventProvider: function MicrosoftCalendarEventProvider(
    params,
  ) {
    providerMocks.microsoftConstructor(params);
    return {
      cancelEvent: providerMocks.cancelEvent,
      createEvent: providerMocks.createEvent,
    };
  },
}));

describe("createCalendarEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.createEvent.mockResolvedValue({
      id: "provider-event-id",
      providerCalendarId: "primary",
    });
  });

  it("passes the connection id into the Google event provider", async () => {
    prisma.calendar.findFirst.mockResolvedValue({
      calendarId: "primary",
      connection: {
        id: "connection-id",
        provider: "google",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date("2026-05-04T00:00:00.000Z"),
      },
    });

    const result = await createCalendarEvent({
      attendees: [{ name: "Guest User", email: "guest@example.com" }],
      description: "Booked with Guest User",
      destinationCalendarId: "calendar-row-id",
      emailAccountId: "email-account-id",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "CUSTOM",
      locationValue: "Conference room",
      logger: createTestLogger(),
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "UTC",
      title: "Intro call",
    });

    expect(providerMocks.googleConstructor).toHaveBeenCalledWith({
      accessToken: "access-token",
      connectionId: "connection-id",
      emailAccountId: "email-account-id",
      expiresAt: new Date("2026-05-04T00:00:00.000Z").getTime(),
      refreshToken: "refresh-token",
    });
    expect(providerMocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        title: "Intro call",
      }),
    );
    expect(result).toEqual({
      id: "provider-event-id",
      provider: "google",
      providerCalendarId: "primary",
      providerConnectionId: "connection-id",
    });
  });

  it("looks up the connection by id when canceling, ignoring same-provider sibling connections", async () => {
    // The host has two Google connections that both expose a "primary"
    // calendar. Cancel must hit the connection that wrote the event, not
    // whichever one Prisma returns first.
    prisma.calendarConnection.findFirst.mockResolvedValue({
      id: "connection-id",
      provider: "google",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2026-05-04T00:00:00.000Z"),
      calendars: [{ id: "calendar-row-id" }],
    });

    await cancelCalendarEvent({
      emailAccountId: "email-account-id",
      providerConnectionId: "connection-id",
      providerCalendarId: "primary",
      providerEventId: "provider-event-id",
      logger: createTestLogger(),
    });

    expect(prisma.calendarConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "connection-id",
          emailAccountId: "email-account-id",
          isConnected: true,
        }),
        select: expect.objectContaining({
          calendars: {
            where: { calendarId: "primary" },
            select: { id: true },
            take: 1,
          },
        }),
      }),
    );
    expect(providerMocks.googleConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-id",
      }),
    );
    expect(providerMocks.cancelEvent).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "provider-event-id",
    });
  });

  it("rejects cancellation when the calendar does not belong to the connection", async () => {
    prisma.calendarConnection.findFirst.mockResolvedValue({
      id: "connection-id",
      provider: "google",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2026-05-04T00:00:00.000Z"),
      calendars: [],
    });

    await expect(
      cancelCalendarEvent({
        emailAccountId: "email-account-id",
        providerConnectionId: "connection-id",
        providerCalendarId: "other-calendar",
        providerEventId: "provider-event-id",
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Destination calendar not found");

    expect(providerMocks.cancelEvent).not.toHaveBeenCalled();
  });

  it("uses the Microsoft event provider for Microsoft connections", async () => {
    prisma.calendar.findFirst.mockResolvedValue({
      calendarId: "microsoft-calendar",
      connection: {
        id: "connection-id",
        provider: "microsoft",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date("2026-05-04T00:00:00.000Z"),
      },
    });

    await createCalendarEvent({
      attendees: [{ name: "Guest User", email: "guest@example.com" }],
      destinationCalendarId: "calendar-row-id",
      emailAccountId: "email-account-id",
      endTime: new Date("2026-05-04T09:30:00.000Z"),
      locationType: "CUSTOM",
      logger: createTestLogger(),
      startTime: new Date("2026-05-04T09:00:00.000Z"),
      timezone: "UTC",
      title: "Intro call",
    });

    expect(providerMocks.microsoftConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        emailAccountId: "email-account-id",
        refreshToken: "refresh-token",
      }),
    );
    expect(providerMocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "microsoft-calendar",
        title: "Intro call",
      }),
    );
  });

  it("rejects unsupported writable calendar providers", async () => {
    prisma.calendar.findFirst.mockResolvedValue({
      calendarId: "calendar-id",
      connection: {
        id: "connection-id",
        provider: "unsupported",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: null,
      },
    });

    await expect(
      createCalendarEvent({
        attendees: [],
        destinationCalendarId: "calendar-row-id",
        emailAccountId: "email-account-id",
        endTime: new Date("2026-05-04T09:30:00.000Z"),
        locationType: "CUSTOM",
        logger: createTestLogger(),
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        timezone: "UTC",
        title: "Intro call",
      }),
    ).rejects.toThrow("Unsupported calendar provider");
  });
});
