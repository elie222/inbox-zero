import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  BookingLinkLocationType,
  BookingStatus,
} from "@/generated/prisma/enums";
import {
  cancelPublicBooking,
  createPublicBooking,
  getPublicAvailability,
  getPublicBookingForManagement,
  getPublicBookingLinkMetadata,
  reschedulePublicBooking,
} from "@/utils/booking/public";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
} from "@/utils/calendar/event-writer";
import {
  sendBookingCancellationEmails,
  sendBookingConfirmationEmails,
  sendBookingRescheduledEmails,
} from "@/utils/booking/emails";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/calendar/unified-availability", () => ({
  getUnifiedCalendarAvailability: vi.fn(),
}));
vi.mock("@/utils/calendar/event-writer", () => ({
  cancelCalendarEvent: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
}));
vi.mock("@/utils/booking/emails", () => ({
  sendBookingCancellationEmails: vi.fn(),
  sendBookingConfirmationEmails: vi.fn(),
  sendBookingRescheduledEmails: vi.fn(),
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
      providerConnectionId: "connection-id",
      providerCalendarId: "primary",
    });
    vi.mocked(sendBookingConfirmationEmails).mockResolvedValue(undefined);
    vi.mocked(sendBookingCancellationEmails).mockResolvedValue(undefined);
    vi.mocked(sendBookingRescheduledEmails).mockResolvedValue(undefined);
    mockBookingLinkConfig();
  });

  it("returns public link metadata without exposing host email or location value", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      slug: "intro",
      title: "Intro call",
      description: "Talk through fit.",
      durationMinutes: 30,
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: "https://video.example.com/private-meeting",
      emailAccount: {
        name: "Host User",
      },
    });

    const result = await getPublicBookingLinkMetadata("intro");

    expect(result).toEqual({
      slug: "intro",
      title: "Intro call",
      description: "Talk through fit.",
      durationMinutes: 30,
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: null,
      hostName: "Host User",
    });
    expect(result).not.toHaveProperty("hostEmail");
    expect(result.locationValue).toBeNull();
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

  it("returns no availability when existing bookings cannot be loaded", async () => {
    prisma.booking.findMany.mockRejectedValue(
      new Error("database unavailable"),
    );

    const result = await getPublicAvailability({
      slug: "intro",
      start: new Date("2026-05-04T00:00:00.000Z"),
      end: new Date("2026-05-05T00:00:00.000Z"),
      logger,
    });

    expect(result).toEqual([]);
  });

  it("blocks availability with stale pending bookings", async () => {
    prisma.booking.findMany.mockResolvedValue([
      bookingRecord({
        createdAt: new Date("2026-05-03T23:00:00.000Z"),
        status: BookingStatus.PENDING_PROVIDER_EVENT,
      }),
    ]);

    const result = await getPublicAvailability({
      slug: "intro",
      start: new Date("2026-05-04T00:00:00.000Z"),
      end: new Date("2026-05-05T00:00:00.000Z"),
      logger,
    });

    expect(result.map((slot) => slot.startTime)).not.toContain(
      "2026-05-04T09:00:00.000Z",
    );
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

  it("fails closed before creating a booking when existing bookings cannot be loaded", async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(
      createPublicBooking({
        input: publicBookingInput({ idempotencyToken: "token-db-unavailable" }),
        logger,
      }),
    ).rejects.toThrow("Calendar availability is temporarily unavailable");

    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("creates a confirmed booking and calendar event for an available slot", async () => {
    vi.mocked(createCalendarEvent).mockResolvedValue({
      id: "provider-event-id",
      provider: "google",
      providerConnectionId: "connection-id",
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
        providerConnectionId: "connection-id",
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
        guestName: "Guest <User>",
        guestEmail: "GUEST@EXAMPLE.COM",
        guestNote: "Please share <agenda> & links.",
        idempotencyToken: "token-1",
      },
      logger,
    });

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attendees: [{ name: "Guest <User>", email: "GUEST@EXAMPLE.COM" }],
        description: expect.stringContaining(
          "Booked with Guest <User>\nGuest email: GUEST@EXAMPLE.COM\nGuest note: Please share <agenda> & links.",
        ),
        destinationCalendarId: "calendar-row-id",
        emailAccountId: "email-account-id",
        endTime: new Date("2026-05-04T09:30:00.000Z"),
        locationType: BookingLinkLocationType.CUSTOM,
        locationValue: "Video link",
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        timezone: "UTC",
        title: "Intro call between Host User and Guest <User>",
      }),
    );
    const calendarEventCall = vi.mocked(createCalendarEvent).mock.calls[0][0];
    expect(calendarEventCall.description).not.toContain("key=");
    expect(calendarEventCall.description).not.toContain("/book/cancel/");
    expect(calendarEventCall.description).toMatch(
      /Need to reschedule or cancel\? https?:\/\/[^\s]+\/book\/reschedule\/booking-id\?token=/,
    );
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guestEmail: "guest@example.com",
          idempotencyToken: "token-1",
          status: BookingStatus.PENDING_PROVIDER_EVENT,
        }),
      }),
    );
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "google",
          providerConnectionId: "connection-id",
          providerCalendarId: "primary",
          providerEventId: "provider-event-id",
          status: BookingStatus.CONFIRMED,
          videoConferenceLink: "https://meet.example.com/meeting",
        }),
      }),
    );
    expect(sendBookingConfirmationEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: expect.objectContaining({ id: "booking-id" }),
        cancelUrl: expect.stringContaining("/book/cancel/booking-id?token="),
        rescheduleUrl: expect.stringContaining(
          "/book/reschedule/booking-id?token=",
        ),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "booking-id",
        status: BookingStatus.CONFIRMED,
        startTime: "2026-05-04T09:00:00.000Z",
        endTime: "2026-05-04T09:30:00.000Z",
        cancelUrl: expect.stringContaining("/book/cancel/booking-id?token="),
        rescheduleUrl: expect.stringContaining(
          "/book/reschedule/booking-id?token=",
        ),
      }),
    );
    expectPublicBookingResult(result, { managementUrls: "present" });
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
      id: "booking-id",
      status: BookingStatus.CONFIRMED,
      startTime: "2026-05-04T09:00:00.000Z",
      endTime: "2026-05-04T09:30:00.000Z",
    });
    expectPublicBookingResult(result, { managementUrls: "absent" });
  });

  it("retries a failed idempotent booking instead of returning it as success", async () => {
    prisma.booking.findFirst.mockResolvedValue(
      bookingRecord({ status: BookingStatus.FAILED }),
    );
    prisma.booking.delete.mockResolvedValue({} as any);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.create.mockResolvedValue(
      bookingRecord({ status: BookingStatus.PENDING_PROVIDER_EVENT }),
    );
    prisma.booking.update.mockResolvedValue(
      bookingRecord({
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );

    const result = await createPublicBooking({
      input: publicBookingInput({ idempotencyToken: "failed-token" }),
      logger,
    });

    expect(prisma.booking.delete).toHaveBeenCalledWith({
      where: { id: "booking-id" },
    });
    expect(prisma.booking.create).toHaveBeenCalled();
    expect(result.status).toBe(BookingStatus.CONFIRMED);
  });

  it("rejects a canceled idempotent booking with a clear retry message", async () => {
    prisma.booking.findFirst.mockResolvedValue(
      bookingRecord({ status: BookingStatus.CANCELED }),
    );

    await expect(
      createPublicBooking({
        input: publicBookingInput({ idempotencyToken: "canceled-token" }),
        logger,
      }),
    ).rejects.toThrow(
      "Booking was canceled. Please submit a new booking request.",
    );

    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it("retries a stale pending idempotent booking", async () => {
    prisma.booking.findFirst.mockResolvedValue(
      bookingRecord({
        createdAt: new Date("2026-05-03T23:00:00.000Z"),
        status: BookingStatus.PENDING_PROVIDER_EVENT,
      }),
    );
    prisma.booking.delete.mockResolvedValue({} as any);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.create.mockResolvedValue(
      bookingRecord({ status: BookingStatus.PENDING_PROVIDER_EVENT }),
    );
    prisma.booking.update.mockResolvedValue(
      bookingRecord({
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );

    const result = await createPublicBooking({
      input: publicBookingInput({ idempotencyToken: "pending-token" }),
      logger,
    });

    expect(prisma.booking.delete).toHaveBeenCalledWith({
      where: { id: "booking-id" },
    });
    expect(prisma.booking.create).toHaveBeenCalled();
    expect(result.status).toBe(BookingStatus.CONFIRMED);
  });

  it("does not retry a recent pending idempotent booking", async () => {
    prisma.booking.findFirst.mockResolvedValue(
      bookingRecord({
        createdAt: new Date("2026-05-03T23:55:00.000Z"),
        status: BookingStatus.PENDING_PROVIDER_EVENT,
      }),
    );

    await expect(
      createPublicBooking({
        input: publicBookingInput({ idempotencyToken: "pending-token" }),
        logger,
      }),
    ).rejects.toThrow("Booking request is still being processed");

    expect(prisma.booking.delete).not.toHaveBeenCalled();
    expect(prisma.booking.create).not.toHaveBeenCalled();
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
      providerConnectionId: "connection-id",
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
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findUniqueOrThrow.mockResolvedValue(
      bookingRecord({
        cancellationReason: "No longer needed",
        status: BookingStatus.CANCELED,
      }),
    );

    const result = await cancelPublicBooking({
      id: "booking-id",
      token: "cancel-token",
      reason: "No longer needed",
      logger,
    });

    expect(cancelCalendarEvent).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      providerConnectionId: "connection-id",
      providerCalendarId: "primary",
      providerEventId: "provider-event-id",
      logger,
    });
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-id", status: BookingStatus.CONFIRMED },
        data: {
          status: BookingStatus.CANCELED,
          cancellationReason: "No longer needed",
        },
      }),
    );
    expect(sendBookingCancellationEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: expect.objectContaining({ status: BookingStatus.CANCELED }),
      }),
    );
    expect(result).toEqual({
      id: "booking-id",
      status: BookingStatus.CANCELED,
      startTime: "2026-05-04T09:00:00.000Z",
      endTime: "2026-05-04T09:30:00.000Z",
    });
    expectPublicBookingResult(result, { managementUrls: "absent" });
  });

  it("still cancels the booking locally when the provider event cleanup fails", async () => {
    vi.mocked(cancelCalendarEvent).mockRejectedValue(
      new Error("Calendar connection not found"),
    );
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("cancel-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findUniqueOrThrow.mockResolvedValue(
      bookingRecord({ status: BookingStatus.CANCELED }),
    );

    const result = await cancelPublicBooking({
      id: "booking-id",
      token: "cancel-token",
      logger,
    });

    expect(cancelCalendarEvent).toHaveBeenCalled();
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-id", status: BookingStatus.CONFIRMED },
        data: expect.objectContaining({ status: BookingStatus.CANCELED }),
      }),
    );
    expect(sendBookingCancellationEmails).toHaveBeenCalled();
    expect(result.status).toBe(BookingStatus.CANCELED);
  });

  it("does not re-cancel or re-notify when another request already canceled the booking", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("cancel-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      cancelPublicBooking({
        id: "booking-id",
        token: "cancel-token",
        logger,
      }),
    ).rejects.toThrow("Booking is already canceled");

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(sendBookingCancellationEmails).not.toHaveBeenCalled();
  });

  it("rejects cancellation with a generic error for missing bookings and invalid tokens", async () => {
    prisma.booking.findUnique.mockResolvedValueOnce(null);

    await expect(
      cancelPublicBooking({
        id: "missing-booking-id",
        token: "wrong-token",
        logger,
      }),
    ).rejects.toMatchObject({
      name: "SafeError",
      safeMessage: "Invalid cancellation link",
      statusCode: 404,
    });

    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("correct-token"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await expect(
      cancelPublicBooking({
        id: "booking-id",
        token: "wrong-token",
        logger,
      }),
    ).rejects.toMatchObject({
      name: "SafeError",
      safeMessage: "Invalid cancellation link",
      statusCode: 404,
    });

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
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
        id: "booking-id",
        token: "cancel-token",
        logger,
      }),
    ).rejects.toThrow("Bookings that have started cannot be canceled");

    expect(cancelCalendarEvent).not.toHaveBeenCalled();
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("reschedules a confirmed booking and updates the provider event", async () => {
    vi.mocked(updateCalendarEvent).mockResolvedValue(undefined);
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findUniqueOrThrow.mockResolvedValue(
      bookingRecord({
        startTime: new Date("2026-05-11T09:00:00.000Z"),
        endTime: new Date("2026-05-11T09:30:00.000Z"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    const result = await reschedulePublicBooking({
      id: "booking-id",
      token: "manage-token",
      startTime: "2026-05-11T09:00:00.000Z",
      guestTimezone: "UTC",
      logger,
    });

    expect(prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "booking-id",
          status: BookingStatus.CONFIRMED,
          startTime: new Date("2026-05-04T09:00:00.000Z"),
          endTime: new Date("2026-05-04T09:30:00.000Z"),
        },
        data: {
          startTime: new Date("2026-05-11T09:00:00.000Z"),
          endTime: new Date("2026-05-11T09:30:00.000Z"),
        },
      }),
    );
    expect(updateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        startTime: new Date("2026-05-11T09:00:00.000Z"),
        endTime: new Date("2026-05-11T09:30:00.000Z"),
      }),
    );
    expect(sendBookingRescheduledEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: expect.objectContaining({ status: BookingStatus.CONFIRMED }),
        previousStartTime: new Date("2026-05-04T09:00:00.000Z"),
        rescheduleUrl: expect.stringContaining(
          "/book/reschedule/booking-id?token=",
        ),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "booking-id",
        status: BookingStatus.CONFIRMED,
        startTime: "2026-05-11T09:00:00.000Z",
        endTime: "2026-05-11T09:30:00.000Z",
        rescheduleUrl: expect.stringContaining(
          "/book/reschedule/booking-id?token=",
        ),
        cancelUrl: expect.stringContaining("/book/cancel/booking-id?token="),
      }),
    );
  });

  it("does not reschedule when another request already moved the booking", async () => {
    vi.mocked(updateCalendarEvent).mockResolvedValue(undefined);
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reschedulePublicBooking({
        id: "booking-id",
        token: "manage-token",
        startTime: "2026-05-11T09:00:00.000Z",
        guestTimezone: "UTC",
        logger,
      }),
    ).rejects.toThrow("Booking cannot be rescheduled");

    expect(prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "booking-id",
          status: BookingStatus.CONFIRMED,
          startTime: new Date("2026-05-04T09:00:00.000Z"),
          endTime: new Date("2026-05-04T09:30:00.000Z"),
        }),
      }),
    );
    expect(updateCalendarEvent).not.toHaveBeenCalled();
    expect(sendBookingRescheduledEmails).not.toHaveBeenCalled();
  });

  it("rolls back the local slot claim when the provider update fails", async () => {
    vi.mocked(updateCalendarEvent).mockRejectedValue(new Error("provider 500"));
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      reschedulePublicBooking({
        id: "booking-id",
        token: "manage-token",
        startTime: "2026-05-11T09:00:00.000Z",
        guestTimezone: "UTC",
        logger,
      }),
    ).rejects.toThrow("Failed to update calendar event");

    // First call claims the new slot, second call rolls it back.
    expect(prisma.booking.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.booking.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          startTime: new Date("2026-05-04T09:00:00.000Z"),
          endTime: new Date("2026-05-04T09:30:00.000Z"),
        },
      }),
    );
    expect(sendBookingRescheduledEmails).not.toHaveBeenCalled();
  });

  it("logs when provider update rollback cannot find the claimed slot", async () => {
    const errorSpy = vi.spyOn(logger, "error");
    vi.mocked(updateCalendarEvent).mockRejectedValue(new Error("provider 500"));
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      reschedulePublicBooking({
        id: "booking-id",
        token: "manage-token",
        startTime: "2026-05-11T09:00:00.000Z",
        guestTimezone: "UTC",
        logger,
      }),
    ).rejects.toThrow("Failed to update calendar event");

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to roll back reschedule slot claim",
      expect.objectContaining({
        bookingId: "booking-id",
        reason: "no matching booking state",
      }),
    );
  });

  it("rejects reschedule with a generic error for invalid tokens", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("correct-token"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await expect(
      reschedulePublicBooking({
        id: "booking-id",
        token: "wrong-token",
        startTime: "2026-05-11T09:00:00.000Z",
        guestTimezone: "UTC",
        logger,
      }),
    ).rejects.toMatchObject({
      name: "SafeError",
      safeMessage: "Invalid reschedule link",
      statusCode: 404,
    });

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    expect(updateCalendarEvent).not.toHaveBeenCalled();
  });

  it("rejects reschedule when the booking has already started", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        startTime: new Date("2026-05-03T23:59:00.000Z"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await expect(
      reschedulePublicBooking({
        id: "booking-id",
        token: "manage-token",
        startTime: "2026-05-11T09:00:00.000Z",
        guestTimezone: "UTC",
        logger,
      }),
    ).rejects.toThrow("Bookings that have started cannot be rescheduled");

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("rejects reschedule to the same time", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await expect(
      reschedulePublicBooking({
        id: "booking-id",
        token: "manage-token",
        startTime: "2026-05-04T09:00:00.000Z",
        guestTimezone: "UTC",
        logger,
      }),
    ).rejects.toThrow("Pick a different time to reschedule");

    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("excludes the booking being rescheduled from the busy-period check", async () => {
    vi.mocked(updateCalendarEvent).mockResolvedValue(undefined);
    vi.mocked(getUnifiedCalendarAvailability).mockResolvedValue([
      {
        start: new Date("2026-05-04T09:00:00.000Z"),
        end: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);
    mockBookingLinkConfig({
      durationMinutes: 60,
      windows: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 }],
    });
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        provider: "google",
        providerConnectionId: "connection-id",
        providerCalendarId: "primary",
        providerEventId: "provider-event-id",
        endTime: new Date("2026-05-04T10:00:00.000Z"),
        status: BookingStatus.CONFIRMED,
      }),
    );
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.findUniqueOrThrow.mockResolvedValue(
      bookingRecord({
        startTime: new Date("2026-05-11T09:00:00.000Z"),
        endTime: new Date("2026-05-11T09:30:00.000Z"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    await reschedulePublicBooking({
      id: "booking-id",
      token: "manage-token",
      startTime: "2026-05-04T09:30:00.000Z",
      guestTimezone: "UTC",
      logger,
    });

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "booking-id" },
        }),
      }),
    );
  });

  it("returns public management metadata for confirmed future bookings", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        status: BookingStatus.CONFIRMED,
        bookingLink: {
          description: "Talk through fit.",
          durationMinutes: 30,
          slotIntervalMinutes: 30,
          locationValue: "Room 3",
        },
      }),
    );

    const result = await getPublicBookingForManagement({
      id: "booking-id",
      token: "manage-token",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "booking-id",
        status: BookingStatus.CONFIRMED,
        bookingLink: expect.objectContaining({
          description: "Talk through fit.",
          locationValue: "Room 3",
          hostName: "Host User",
        }),
      }),
    );
  });

  it("does not return management metadata for canceled bookings", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        status: BookingStatus.CANCELED,
      }),
    );

    const result = await getPublicBookingForManagement({
      id: "booking-id",
      token: "manage-token",
    });

    expect(result).toBeNull();
  });

  it("does not return management metadata for bookings that have started", async () => {
    prisma.booking.findUnique.mockResolvedValue(
      bookingRecord({
        cancelTokenHash: hashToken("manage-token"),
        startTime: new Date("2026-05-03T23:59:00.000Z"),
        status: BookingStatus.CONFIRMED,
      }),
    );

    const result = await getPublicBookingForManagement({
      id: "booking-id",
      token: "manage-token",
    });

    expect(result).toBeNull();
  });

  it("rejects availability when the destination calendar is no longer enabled", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      title: "Intro call",
      description: null,
      durationMinutes: 30,
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: "Video link",
      minimumNoticeMinutes: 0,
      maxDaysAhead: 30,
      emailAccountId: "email-account-id",
      destinationCalendarId: "calendar-row-id",
      availabilitySchedule: {
        timezone: "UTC",
        windows: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
      },
      emailAccount: {
        calendarConnections: [
          { id: "connection-id", calendars: [{ id: "other-calendar-id" }] },
        ],
      },
    });

    await expect(
      getPublicAvailability({
        slug: "intro",
        start: new Date("2026-05-04T00:00:00.000Z"),
        end: new Date("2026-05-05T00:00:00.000Z"),
        logger,
      }),
    ).rejects.toThrow("No enabled calendar is available for this host");
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

function mockBookingLinkConfig(
  overrides: {
    durationMinutes?: number;
    windows?: { weekday: number; startMinutes: number; endMinutes: number }[];
  } = {},
) {
  prisma.bookingLink.findFirst.mockResolvedValue({
    id: "booking-link-id",
    title: "Intro call",
    description: null,
    durationMinutes: overrides.durationMinutes ?? 30,
    locationType: BookingLinkLocationType.CUSTOM,
    locationValue: "Video link",
    minimumNoticeMinutes: 0,
    maxDaysAhead: 30,
    emailAccountId: "email-account-id",
    destinationCalendarId: "calendar-row-id",
    availabilitySchedule: {
      timezone: "UTC",
      windows: overrides.windows ?? [
        { weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 },
      ],
    },
    emailAccount: {
      name: "Host User",
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
    bookingLinkId: "booking-link-id",
    emailAccountId: "email-account-id",
    guestName: "Guest User",
    guestEmail: "guest@example.com",
    guestNote: null,
    startTime: new Date("2026-05-04T09:00:00.000Z"),
    endTime: new Date("2026-05-04T09:30:00.000Z"),
    status: BookingStatus.CONFIRMED,
    provider: null,
    providerConnectionId: null,
    providerCalendarId: null,
    providerEventId: null,
    videoConferenceLink: null,
    cancelTokenHash: hashToken("cancel-token"),
    cancellationReason: null,
    idempotencyToken: "token-1",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    bookingLink: {
      slug: "intro",
      title: "Intro call",
      description: null,
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: "Video link",
      availabilitySchedule: {
        timezone: "UTC",
      },
      emailAccount: {
        email: "host@example.com",
        name: "Host User",
      },
    },
  };
}

function expectPublicBookingResult(
  result: Record<string, unknown>,
  { managementUrls }: { managementUrls: "present" | "absent" },
) {
  const privateFields = [
    "bookingLinkId",
    "emailAccountId",
    "guestName",
    "guestEmail",
    "guestNote",
    "provider",
    "providerConnectionId",
    "providerCalendarId",
    "providerEventId",
    "videoConferenceLink",
    "cancelTokenHash",
    "cancellationReason",
    "idempotencyToken",
    "bookingLink",
    "hostEmail",
  ];

  for (const field of privateFields) {
    expect(result).not.toHaveProperty(field);
  }

  if (managementUrls === "present") {
    expect(result.cancelUrl).toEqual(expect.stringContaining("/book/cancel/"));
    expect(result.rescheduleUrl).toEqual(
      expect.stringContaining("/book/reschedule/"),
    );
  } else {
    expect(result).not.toHaveProperty("cancelUrl");
    expect(result).not.toHaveProperty("rescheduleUrl");
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
