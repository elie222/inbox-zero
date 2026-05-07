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
  MicrosoftCalendarEventProvider: vi.fn(),
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
    });
  });

  it("passes the connection id into the Google event provider when canceling", async () => {
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

    await cancelCalendarEvent({
      emailAccountId: "email-account-id",
      provider: "google",
      providerCalendarId: "primary",
      providerEventId: "provider-event-id",
      logger: createTestLogger(),
    });

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
});
