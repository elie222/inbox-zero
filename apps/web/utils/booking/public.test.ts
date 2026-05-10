import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  BookingCanceledBy,
  BookingLinkLocationType,
  BookingStatus,
} from "@/generated/prisma/enums";
import {
  cancelPublicBooking,
  createPublicBooking,
  getPublicAvailability,
  getPublicBookingLinkMetadata,
} from "@/utils/booking/public";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import {
  cancelCalendarEvent,
  createCalendarEvent,
} from "@/utils/calendar/event-writer";
import {
  sendBookingCancellationEmails,
  sendBookingConfirmationEmails,
} from "@/utils/booking/emails";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/calendar/unified-availability", () => ({
  getUnifiedCalendarAvailability: vi.fn(),
}));
vi.mock("@/utils/calendar/event-writer", () => ({
  cancelCalendarEvent: vi.fn(),
  createCalendarEvent: vi.fn(),
}));
vi.mock("@/utils/booking/emails", () => ({
  sendBookingCancellationEmails: vi.fn(),
  sendBookingConfirmationEmails: vi.fn(),
}));

const logger = createTestLogger();

describe("public booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));
    vi.mocked(getUnifiedCalendarAvailability).mockResolvedValue([]);
    vi.mocked(createCalendarEvent).mockResolvedValue({
      id: "provider-event-id",
      provider: "google",
      providerCalendarId: "primary",
    });
    vi.mocked(sendBookingConfirmationEmails).mockResolvedValue(undefined);
    vi.mocked(sendBookingCancellationEmails).mockResolvedValue(undefined);
    mockBookingLinkConfig();
  });

  it("returns public link metadata", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      slug: "intro",
      title: "Intro call",
      description: "Talk through fit.",
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: "Private room",
      emailAccount: {
        email: "host@example.com",
        name: "Host User",
      },
    });

    const result = await getPublicBookingLinkMetadata("intro");

    expect(result).toEqual(
      expect.objectContaining({
        slug: "intro",
        title: "Intro call",
        durationMinutes: 30,
        hostEmail: "host@example.com",
        hostName: "Host User",
      }),
    );
  });

  it("accepts a calendar-month availability range across DST fallback", async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    await expect(
      getPublicAvailability({
        slug: "intro",
        start: new Date("2026-09-30T22:00:00.000Z"),
        end: new Date("2026-10-31T23:00:00.000Z"),
        logger,
      }),
    ).resolves.toEqual([]);

    expect(getUnifiedCalendarAvailability).toHaveBeenCalled();
  });

  it("returns no availability when calendar availability fails", async () => {
    vi.mocked(getUnifiedCalendarAvailability).mockRejectedValue(
      new Error("provider unavailable"),
    );
    prisma.booking.findMany.mockResolvedValue([]);

    const result = await getPublicAvailability({
      slug: "intro",
      start: new Date("2026-05-04T00:00:00.000Z"),
      end: new Date("2026-05-05T00:00:00.000Z"),
      logger,
    });

    expect(result).toEqual([]);
  });

  it("fails closed before creating a booking when calendar availability fails", async () => {
    vi.mocked(getUnifiedCalendarAvailability).mockRejectedValue(
      new Error("provider unavailable"),
    );
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);

    await expect(
      createPublicBooking({
        input: publicBookingInput({ idempotencyToken: "token-unavailable" }),
        logger,
      }),
    ).rejects.toThrow("Calendar availability is temporarily unavailable");

    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("creates a confirmed booking and calendar event for an available slot", async () => {
    vi.mocked(createCalendarEvent).mockResolvedValue({
      id: "provider-event-id",
      provider: "google",
      providerCalendarId: "primary",
      videoConferenceLink: "https://meet.example.com/meeting",
    });
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.create.mockResolvedValue(
      bookingRecord({ status: BookingStatus.PENDING_PROVIDER_EVENT }),
    );
    prisma.booking.update.mockResolvedValue(
      bookingRecord({
        provider: "google",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );

    const result = await createPublicBooking({
      input: {
        slug: "intro",
        startTime: "2026-05-04T09:00:00.000Z",
        timezone: "UTC",
        guestName: "Guest User",
        guestEmail: "GUEST@EXAMPLE.COM",
        guestNote: "Please share an agenda.",
        idempotencyToken: "token-1",
      },
      logger,
    });

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [{ name: "Guest User", email: "GUEST@EXAMPLE.COM" }],
        description:
          "Booked with Guest User\nGuest email: GUEST@EXAMPLE.COM\nGuest note: Please share an agenda.",
        destinationCalendarId: "calendar-row-id",
        emailAccountId: "email-account-id",
        endTime: new Date("2026-05-04T09:30:00.000Z"),
        locationType: BookingLinkLocationType.CUSTOM,
        locationValue: "Video link",
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        timezone: "UTC",
        title: "Intro call",
      }),
    );
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guestEmail: "guest@example.com",
          idempotencyToken: "token-1",
          status: BookingStatus.PENDING_PROVIDER_EVENT,
          linkTitle: "Intro call",
        }),
      }),
    );
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "google",
          providerCalendarId: "primary",
          providerEventId: "provider-event-id",
          status: BookingStatus.CONFIRMED,
          videoConferenceLink: "https://meet.example.com/meeting",
        }),
      }),
    );
    expect(sendBookingConfirmationEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: expect.objectContaining({ uid: "booking-uid" }),
        cancelUrl: expect.stringContaining("/book/cancel/booking-uid?token="),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        uid: "booking-uid",
        status: BookingStatus.CONFIRMED,
        startTime: "2026-05-04T09:00:00.000Z",
        endTime: "2026-05-04T09:30:00.000Z",
        cancelUrl: expect.stringContaining("/book/cancel/booking-uid?token="),
      }),
    );
  });

  it("returns an idempotent booking without creating a second event", async () => {
    prisma.booking.findFirst.mockResolvedValue(
      bookingRecord({ status: BookingStatus.CONFIRMED }),
    );

    const result = await createPublicBooking({
      input: {
        slug: "intro",
        startTime: "2026-05-04T09:00:00.000Z",
        timezone: "UTC",
        guestName: "Guest User",
        guestEmail: "guest@example.com",
        idempotencyToken: "token-1",
      },
      logger,
    });

    expect(prisma.booking.create).not.toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(sendBookingConfirmationEmails).not.toHaveBeenCalled();
    expect(result).toEqual({
      uid: "booking-uid",
      status: BookingStatus.CONFIRMED,
      startTime: "2026-05-04T09:00:00.000Z",
      endTime: "2026-05-04T09:30:00.000Z",
    });
  });

  it("rejects overlapping bookings via the partial EXCLUDE constraint", async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.create.mockRejectedValue(
      new Error("exclusion constraint failed with SQL state 23P01"),
    );

    await expect(
      createPublicBooking({
        input: publicBookingInput({ idempotencyToken: "token-overlap" }),
        logger,
      }),
    ).rejects.toThrow("Selected slot is no longer available");

    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("cancels a provider event when local confirmation fails after event creation", async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.create.mockResolvedValue(
      bookingRecord({ status: BookingStatus.PENDING_PROVIDER_EVENT }),
    );
    prisma.booking.update
      .mockRejectedValueOnce(new Error("database write failed"))
      .mockResolvedValueOnce(bookingRecord({ status: BookingStatus.FAILED }));
    vi.mocked(cancelCalendarEvent).mockResolvedValue(undefined);

    await expect(
      createPublicBooking({
        input: {
          slug: "intro",
          startTime: "2026-05-04T09:00:00.000Z",
          timezone: "UTC",
          guestName: "Guest User",
          guestEmail: "guest@example.com",
          idempotencyToken: "token-2",
        },
        logger,
      }),
    ).rejects.toThrow("Failed to create calendar event");

    expect(cancelCalendarEvent).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      provider: "google",
      providerCalendarId: "primary",
      providerEventId: "provider-event-id",
      logger,
    });
    expect(prisma.booking.update).toHaveBeenLastCalledWith({
      where: { id: "booking-id" },
      data: { status: BookingStatus.FAILED },
    });
    expect(sendBookingConfirmationEmails).not.toHaveBeenCalled();
  });

  it("cancels a confirmed future booking with a valid token", async () => {
    vi.mocked(cancelCalendarEvent).mockResolvedValue(undefined);
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("cancel-token"),
        provider: "google",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.update.mockResolvedValue(
      bookingRecord({
        canceledBy: BookingCanceledBy.GUEST,
        cancellationReason: "No longer needed",
        status: BookingStatus.CANCELED,
      }),
    );

    const result = await cancelPublicBooking({
      uid: "booking-uid",
      token: "cancel-token",
      reason: "No longer needed",
      logger,
    });

    expect(cancelCalendarEvent).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      provider: "google",
      providerCalendarId: "primary",
      providerEventId: "provider-event-id",
      logger,
    });
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: BookingStatus.CANCELED,
          cancellationReason: "No longer needed",
          canceledBy: BookingCanceledBy.GUEST,
        },
      }),
    );
    expect(sendBookingCancellationEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: expect.objectContaining({ status: BookingStatus.CANCELED }),
      }),
    );
    expect(result.status).toBe(BookingStatus.CANCELED);
  });

  it("rejects cancellation with an invalid token", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("correct-token"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await expect(
      cancelPublicBooking({
        uid: "booking-uid",
        token: "wrong-token",
        logger,
      }),
    ).rejects.toThrow("Invalid cancellation token");

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("rejects cancellation for bookings that have already started", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("cancel-token"),
        startTime: new Date("2026-05-03T23:59:00.000Z"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await expect(
      cancelPublicBooking({
        uid: "booking-uid",
        token: "cancel-token",
        logger,
      }),
    ).rejects.toThrow("Bookings that have started cannot be canceled");

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });
});

function publicBookingInput(
  overrides: Partial<Parameters<typeof createPublicBooking>[0]["input"]> = {},
): Parameters<typeof createPublicBooking>[0]["input"] {
  return {
    slug: "intro",
    startTime: "2026-05-04T09:00:00.000Z",
    timezone: "UTC",
    guestName: "Guest User",
    guestEmail: "guest@example.com",
    idempotencyToken: "token-1",
    ...overrides,
  };
}

function mockBookingLinkConfig() {
  prisma.bookingLink.findFirst.mockResolvedValue({
    id: "booking-link-id",
    title: "Intro call",
    description: null,
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    locationType: BookingLinkLocationType.CUSTOM,
    locationValue: "Video link",
    minimumNoticeMinutes: 0,
    maxDaysAhead: 30,
    timezone: "UTC",
    emailAccountId: "email-account-id",
    destinationCalendarId: "calendar-row-id",
    windows: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
    emailAccount: {
      calendarConnections: [
        { id: "connection-id", calendars: [{ id: "calendar-row-id" }] },
      ],
    },
  });
}

function bookingRecord(
  overrides: Partial<ReturnType<typeof bookingRecordBase>> = {},
) {
  return {
    ...bookingRecordBase(),
    ...overrides,
    bookingLink: {
      ...bookingRecordBase().bookingLink,
      ...overrides.bookingLink,
    },
  };
}

function bookingRecordBase() {
  return {
    id: "booking-id",
    uid: "booking-uid",
    bookingLinkId: "booking-link-id",
    emailAccountId: "email-account-id",
    guestName: "Guest User",
    guestEmail: "guest@example.com",
    guestNote: null,
    startTime: new Date("2026-05-04T09:00:00.000Z"),
    endTime: new Date("2026-05-04T09:30:00.000Z"),
    status: BookingStatus.CONFIRMED,
    provider: null,
    providerCalendarId: null,
    providerEventId: null,
    videoConferenceLink: null,
    cancelTokenHash: hashToken("cancel-token"),
    cancellationReason: null,
    canceledBy: null,
    idempotencyToken: "token-1",
    linkTitle: "Intro call",
    linkLocationType: BookingLinkLocationType.CUSTOM,
    linkLocationValue: "Video link",
    linkTimezone: "UTC",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    bookingLink: {
      emailAccount: {
        email: "host@example.com",
        name: "Host User",
      },
    },
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
