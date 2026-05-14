import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  createBookingLinkAction,
  deleteBookingLinkAction,
  updateBookingAvailabilityAction,
  updateBookingLinkAction,
} from "@/utils/actions/booking";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

describe("booking actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("creates a booking link with provider video and default windows", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({ id: "calendar-id" } as any);
    prisma.calendar.findUnique.mockResolvedValue({
      connection: { provider: "microsoft" },
    } as any);
    prisma.bookingLink.create.mockResolvedValue({
      id: "booking-link-id",
    } as any);

    const result = await createBookingLinkAction("email-account-id", {
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 30,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailAccountId: "email-account-id",
          slug: "intro-call",
          durationMinutes: 30,
          slotIntervalMinutes: 30,
          locationType: BookingLinkLocationType.MICROSOFT_TEAMS,
          destinationCalendarId: "calendar-id",
          timezone: "UTC",
          windows: {
            create: [
              { weekday: 1, startMinutes: 540, endMinutes: 1020 },
              { weekday: 2, startMinutes: 540, endMinutes: 1020 },
              { weekday: 3, startMinutes: 540, endMinutes: 1020 },
              { weekday: 4, startMinutes: 540, endMinutes: 1020 },
              { weekday: 5, startMinutes: 540, endMinutes: 1020 },
            ],
          },
        }),
      }),
    );
  });

  it("anchors 45-minute calls to a 30-minute slot interval", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({ id: "calendar-id" } as any);
    prisma.calendar.findUnique.mockResolvedValue({
      connection: { provider: "google" },
    } as any);
    prisma.bookingLink.create.mockResolvedValue({
      id: "booking-link-id",
    } as any);

    await createBookingLinkAction("email-account-id", {
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 45,
    });

    expect(prisma.bookingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          durationMinutes: 45,
          slotIntervalMinutes: 30,
        }),
      }),
    );
  });

  it("derives slot interval from duration on update", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      durationMinutes: 60,
    });

    expect(prisma.bookingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          durationMinutes: 60,
          slotIntervalMinutes: 30,
        }),
      }),
    );
  });

  it("leaves slot interval unchanged when duration is not updated", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      title: "Renamed",
    });

    const updateCall = prisma.bookingLink.update.mock.calls[0]?.[0];
    expect(updateCall?.data?.slotIntervalMinutes).toBeUndefined();
  });

  it("creates a booking link without provider video when disabled", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({ id: "calendar-id" } as any);
    prisma.calendar.findUnique.mockResolvedValue({
      connection: { provider: "microsoft" },
    } as any);
    prisma.bookingLink.create.mockResolvedValue({
      id: "booking-link-id",
    } as any);

    const result = await createBookingLinkAction("email-account-id", {
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 30,
      videoEnabled: false,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationType: BookingLinkLocationType.CUSTOM,
        }),
      }),
    );
  });

  it("rejects creating a booking link without a connected calendar", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue(null);

    const result = await createBookingLinkAction("email-account-id", {
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 30,
    });

    expect(result?.serverError).toBe(
      "Connect your calendar to create a booking link",
    );
    expect(prisma.bookingLink.create).not.toHaveBeenCalled();
  });

  it("rejects creating a booking link with a disabled destination calendar", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue(null);

    const result = await createBookingLinkAction("email-account-id", {
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 30,
      destinationCalendarId: "disabled-calendar-id",
    });

    expect(result?.serverError).toBe("Destination calendar not found");
    expect(prisma.calendar.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "disabled-calendar-id",
          isEnabled: true,
        }),
      }),
    );
    expect(prisma.bookingLink.create).not.toHaveBeenCalled();
  });

  it("rejects creating more than one booking link for an account", async () => {
    prisma.bookingLink.findFirst.mockResolvedValueOnce({
      id: "existing-booking-link-id",
    } as any);

    const result = await createBookingLinkAction("email-account-id", {
      title: "Intro call",
      slug: "intro-call",
      timezone: "UTC",
      durationMinutes: 30,
    });

    expect(result?.serverError).toBe("Booking link already exists");
    expect(prisma.bookingLink.create).not.toHaveBeenCalled();
  });

  it("rejects an update slug that conflicts with another link", async () => {
    prisma.bookingLink.findFirst
      .mockResolvedValueOnce({ id: "booking-link-id" } as any)
      .mockResolvedValueOnce({ id: "other-link-id" } as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      slug: "other-link",
    });

    expect(result?.serverError).toBe("Booking link slug is already in use");
    expect(prisma.bookingLink.update).not.toHaveBeenCalled();
  });

  it("rejects updates with destination calendars outside the account", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.calendar.findFirst.mockResolvedValue(null);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      destinationCalendarId: "other-calendar-id",
    });

    expect(result?.serverError).toBe("Destination calendar not found");
    expect(prisma.bookingLink.update).not.toHaveBeenCalled();
  });

  it("rejects updates with disabled destination calendars", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.calendar.findFirst.mockResolvedValue(null);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      destinationCalendarId: "disabled-calendar-id",
    });

    expect(result?.serverError).toBe("Destination calendar not found");
    expect(prisma.calendar.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "disabled-calendar-id",
          isEnabled: true,
        }),
      }),
    );
    expect(prisma.bookingLink.update).not.toHaveBeenCalled();
  });

  it("updates link minimum notice and other fields", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      minimumNoticeMinutes: 4 * 60,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-link-id" },
        data: expect.objectContaining({
          minimumNoticeMinutes: 240,
        }),
      }),
    );
  });

  it("replaces availability windows in one update call", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    const windows = [
      { weekday: 1, startMinutes: 9 * 60, endMinutes: 12 * 60 },
      { weekday: 3, startMinutes: 13 * 60, endMinutes: 17 * 60 },
    ];
    const result = await updateBookingAvailabilityAction("email-account-id", {
      bookingLinkId: "booking-link-id",
      timezone: "America/New_York",
      minimumNoticeMinutes: 4 * 60,
      windows,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.update).toHaveBeenCalledWith({
      where: { id: "booking-link-id" },
      data: {
        timezone: "America/New_York",
        minimumNoticeMinutes: 240,
        windows: {
          deleteMany: {},
          create: windows,
        },
      },
    });
  });

  it("rejects availability updates when the link is not owned", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);

    const result = await updateBookingAvailabilityAction("email-account-id", {
      bookingLinkId: "other-booking-link-id",
      timezone: "America/New_York",
      minimumNoticeMinutes: 4 * 60,
      windows: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 12 * 60 }],
    });

    expect(result?.serverError).toBe("Booking link not found");
    expect(prisma.bookingLink.update).not.toHaveBeenCalled();
  });

  it("rejects invalid update payloads before writing", async () => {
    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      locationType: "NOT_A_LOCATION" as BookingLinkLocationType,
    });

    expect(result?.validationErrors).toBeDefined();
    expect(prisma.bookingLink.findFirst).not.toHaveBeenCalled();
    expect(prisma.bookingLink.update).not.toHaveBeenCalled();
  });

  it("deletes an owned booking link", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
    } as any);
    prisma.bookingLink.delete.mockResolvedValue({} as any);

    const result = await deleteBookingLinkAction("email-account-id", {
      id: "booking-link-id",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.delete).toHaveBeenCalledWith({
      where: { id: "booking-link-id" },
    });
  });
});
