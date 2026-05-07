import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  BookingCanceledBy,
  BookingCreationSource,
  BookingEventTypeLocationType,
  BookingStatus,
} from "@/generated/prisma/enums";
import {
  cancelPublicBooking,
  createPublicBooking,
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
    mockEventTypeConfig();
  });

  it("creates a confirmed booking and calendar event for an available slot", async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);
    prisma.bookingSlotLock.deleteMany.mockResolvedValue({ count: 0 });
    prisma.bookingSlotLock.create.mockResolvedValue({ id: "slot-lock-id" });
    prisma.bookingSlotLock.update.mockResolvedValue({});
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
        eventTypeSlug: "meeting",
        startTime: "2026-05-04T09:00:00.000Z",
        timezone: "UTC",
        guestName: "Guest User",
        guestEmail: "GUEST@EXAMPLE.COM",
        guestAdditionalEmails: ["CC@EXAMPLE.COM"],
        guestNote: "Please share an agenda.",
        idempotencyToken: "token-1",
      },
      logger,
    });

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [
          { name: "Guest User", email: "GUEST@EXAMPLE.COM" },
          { email: "CC@EXAMPLE.COM" },
        ],
        description:
          "Booked with Guest User\nGuest email: GUEST@EXAMPLE.COM\nGuest note: Please share an agenda.",
        destinationCalendarId: "calendar-row-id",
        emailAccountId: "email-account-id",
        endTime: new Date("2026-05-04T09:30:00.000Z"),
        locationType: BookingEventTypeLocationType.CUSTOM,
        locationValue: "Video link",
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        timezone: "UTC",
        title: "Intro call",
      }),
    );
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creationSource: BookingCreationSource.PUBLIC,
          guestAdditionalEmails: ["cc@example.com"],
          guestEmail: "guest@example.com",
          idempotencyToken: "token-1",
          status: BookingStatus.PENDING_PROVIDER_EVENT,
        }),
      }),
    );
    expect(prisma.bookingSlotLock.update).toHaveBeenCalledWith({
      where: { id: "slot-lock-id" },
      data: { bookingId: "booking-id" },
    });
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
        eventTypeSlug: "meeting",
        startTime: "2026-05-04T09:00:00.000Z",
        timezone: "UTC",
        guestName: "Guest User",
        guestEmail: "guest@example.com",
        idempotencyToken: "token-1",
      },
      logger,
    });

    expect(prisma.bookingSlotLock.create).not.toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(sendBookingConfirmationEmails).not.toHaveBeenCalled();
    expect(result).toEqual({
      uid: "booking-uid",
      status: BookingStatus.CONFIRMED,
      startTime: "2026-05-04T09:00:00.000Z",
      endTime: "2026-05-04T09:30:00.000Z",
    });
  });

  it("serializes guest limit checks before creating a pending booking", async () => {
    mockEventTypeConfig({ maxActiveBookingsPerGuest: 1 });
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([{ id: "guest-limit-lock-id" }]);
    prisma.bookingSlotLock.deleteMany.mockResolvedValue({ count: 0 });
    prisma.bookingSlotLock.create.mockResolvedValue({ id: "slot-lock-id" });
    prisma.bookingSlotLock.update.mockResolvedValue({});
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

    await createPublicBooking({
      input: {
        slug: "intro",
        eventTypeSlug: "meeting",
        startTime: "2026-05-04T09:00:00.000Z",
        timezone: "UTC",
        guestName: "Guest User",
        guestEmail: "guest@example.com",
        idempotencyToken: "token-2",
      },
      logger,
    });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.booking.count.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.booking.create.mock.invocationCallOrder[0],
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("cancels a provider event when local confirmation fails after event creation", async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);
    prisma.bookingSlotLock.deleteMany.mockResolvedValue({ count: 0 });
    prisma.bookingSlotLock.create.mockResolvedValue({ id: "slot-lock-id" });
    prisma.bookingSlotLock.update.mockResolvedValue({});
    prisma.bookingSlotLock.delete.mockResolvedValue({});
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
          eventTypeSlug: "meeting",
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
    expect(prisma.bookingSlotLock.delete).toHaveBeenCalledWith({
      where: { id: "slot-lock-id" },
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
});

function mockEventTypeConfig({
  maxActiveBookingsPerGuest = null,
}: {
  maxActiveBookingsPerGuest?: number | null;
} = {}) {
  prisma.bookingLink.findFirst.mockResolvedValue({
    id: "booking-link-id",
    eventTypes: [
      {
        id: "event-type-id",
        title: "Intro call",
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        locationType: BookingEventTypeLocationType.CUSTOM,
        locationValue: "Video link",
        minimumNoticeMinutes: 0,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        bookingWindowDays: 30,
        maxActiveBookingsPerGuest,
        disableCancelling: false,
        hideCalendarEventDetails: false,
        hosts: [
          {
            id: "host-id",
            emailAccountId: "email-account-id",
            destinationCalendarId: "calendar-row-id",
            schedule: {
              timezone: "UTC",
              rules: [
                { weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 },
              ],
              dateOverrides: [],
            },
            emailAccount: {
              calendarConnections: [
                { id: "connection-id", calendars: [{ id: "calendar-row-id" }] },
              ],
            },
          },
        ],
      },
    ],
  });
}

function bookingRecord(
  overrides: Partial<ReturnType<typeof bookingRecordBase>> = {},
) {
  return {
    ...bookingRecordBase(),
    ...overrides,
    eventType: {
      ...bookingRecordBase().eventType,
      ...overrides.eventType,
    },
  };
}

function bookingRecordBase() {
  return {
    id: "booking-id",
    uid: "booking-uid",
    eventTypeId: "event-type-id",
    emailAccountId: "email-account-id",
    guestName: "Guest User",
    guestEmail: "guest@example.com",
    guestAdditionalEmails: [],
    guestNote: null,
    startTime: new Date("2026-05-04T09:00:00.000Z"),
    endTime: new Date("2026-05-04T09:30:00.000Z"),
    timezone: "UTC",
    status: BookingStatus.CONFIRMED,
    provider: null,
    providerCalendarId: null,
    providerEventId: null,
    cancelTokenHash: hashToken("cancel-token"),
    cancellationReason: null,
    canceledBy: null,
    creationSource: BookingCreationSource.PUBLIC,
    idempotencyToken: "token-1",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    eventTypeTitle: "Intro call",
    eventTypeDurationMinutes: 30,
    eventTypeLocationType: BookingEventTypeLocationType.CUSTOM,
    eventTypeLocationValue: "Video link",
    eventTypeTimezone: "UTC",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    eventType: {
      disableCancelling: false,
      hideHostEmail: false,
      hosts: [
        {
          emailAccount: {
            email: "host@example.com",
            name: "Host User",
          },
        },
      ],
    },
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
