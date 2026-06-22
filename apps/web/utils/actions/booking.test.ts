import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  createBookingLinkAction,
  deleteBookingLinkAction,
  updateBookingAvailabilityAction,
  updateBookingLinkAction,
  updateDefaultAvailabilityAction,
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
    prisma.availabilitySchedule.findFirst.mockResolvedValue(null);
  });

  it("creates a booking link with provider video and default windows", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-id",
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
          emailAccount: { connect: { id: "email-account-id" } },
          slug: "intro-call",
          durationMinutes: 30,
          slotIntervalMinutes: 30,
          locationType: BookingLinkLocationType.MICROSOFT_TEAMS,
          destinationCalendar: { connect: { id: "calendar-id" } },
          availabilitySchedule: {
            create: expect.objectContaining({
              name: "Default availability",
              isDefault: true,
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
          },
        }),
      }),
    );
  });

  it("anchors 45-minute calls to a 30-minute slot interval", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-id",
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

  it("reuses an existing default availability schedule when recreating a booking link", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.availabilitySchedule.findFirst.mockResolvedValue({
      id: "availability-schedule-id",
    } as any);
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-id",
      connection: { provider: "google" },
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
          availabilitySchedule: {
            connect: { id: "availability-schedule-id" },
          },
        }),
      }),
    );
  });

  it("derives slot interval from duration on update", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      availabilityScheduleId: "availability-schedule-id",
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);
    prisma.availabilitySchedule.update.mockResolvedValue({} as any);

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
    prisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-id",
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

  it("normalizes requested provider video to the destination calendar provider", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      locationType: BookingLinkLocationType.GOOGLE_MEET,
      destinationCalendar: { connection: { provider: "google" } },
    } as any);
    prisma.calendar.findFirst.mockResolvedValue({
      id: "microsoft-calendar-id",
      connection: { provider: "microsoft" },
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      destinationCalendarId: "microsoft-calendar-id",
      locationType: BookingLinkLocationType.GOOGLE_MEET,
      locationValue: "stale provider location",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destinationCalendarId: "microsoft-calendar-id",
          locationType: BookingLinkLocationType.MICROSOFT_TEAMS,
          locationValue: null,
        }),
      }),
    );
  });

  it("updates existing provider video when only the destination calendar changes", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      locationType: BookingLinkLocationType.GOOGLE_MEET,
      destinationCalendar: { connection: { provider: "google" } },
    } as any);
    prisma.calendar.findFirst.mockResolvedValue({
      id: "microsoft-calendar-id",
      connection: { provider: "microsoft" },
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      destinationCalendarId: "microsoft-calendar-id",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destinationCalendarId: "microsoft-calendar-id",
          locationType: BookingLinkLocationType.MICROSOFT_TEAMS,
          locationValue: null,
        }),
      }),
    );
  });

  it("clears the destination calendar when a null update resolves to no default calendar", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      locationType: BookingLinkLocationType.CUSTOM,
      destinationCalendar: null,
    } as any);
    prisma.calendar.findFirst.mockResolvedValue(null);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      destinationCalendarId: null,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destinationCalendarId: null,
        }),
      }),
    );
  });

  it("clears stale provider video when the destination calendar is cleared", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      locationType: BookingLinkLocationType.MICROSOFT_TEAMS,
      destinationCalendar: { connection: { provider: "microsoft" } },
    } as any);
    prisma.calendar.findFirst.mockResolvedValue(null);
    prisma.bookingLink.update.mockResolvedValue({} as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      destinationCalendarId: null,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destinationCalendarId: null,
          locationType: BookingLinkLocationType.CUSTOM,
        }),
      }),
    );
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
      availabilityScheduleId: "availability-schedule-id",
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
    expect(prisma.availabilitySchedule.update).toHaveBeenCalledWith({
      where: { id: "availability-schedule-id" },
      data: {
        timezone: "America/New_York",
        windows: {
          deleteMany: {},
          create: windows,
        },
      },
    });
    expect(prisma.bookingLink.update).toHaveBeenCalledWith({
      where: { id: "booking-link-id" },
      data: {
        minimumNoticeMinutes: 240,
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

  it("creates a default availability schedule when none exists", async () => {
    prisma.availabilitySchedule.findFirst.mockResolvedValue(null);
    prisma.availabilitySchedule.create.mockResolvedValue({} as any);

    const windows = [
      { weekday: 1, startMinutes: 9 * 60, endMinutes: 17 * 60 },
      { weekday: 2, startMinutes: 9 * 60, endMinutes: 17 * 60 },
    ];
    const result = await updateDefaultAvailabilityAction("email-account-id", {
      timezone: "America/New_York",
      windows,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.availabilitySchedule.create).toHaveBeenCalledWith({
      data: {
        name: "Default availability",
        isDefault: true,
        timezone: "America/New_York",
        emailAccount: { connect: { id: "email-account-id" } },
        windows: { create: windows },
      },
    });
    expect(prisma.availabilitySchedule.update).not.toHaveBeenCalled();
  });

  it("replaces windows on the existing default availability schedule", async () => {
    prisma.availabilitySchedule.findFirst.mockResolvedValue({
      id: "availability-schedule-id",
    } as any);
    prisma.availabilitySchedule.update.mockResolvedValue({} as any);

    const windows = [
      { weekday: 4, startMinutes: 10 * 60, endMinutes: 16 * 60 },
    ];
    const result = await updateDefaultAvailabilityAction("email-account-id", {
      timezone: "Europe/London",
      windows,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.availabilitySchedule.update).toHaveBeenCalledWith({
      where: { id: "availability-schedule-id" },
      data: {
        timezone: "Europe/London",
        windows: {
          deleteMany: {},
          create: windows,
        },
      },
    });
    expect(prisma.availabilitySchedule.create).not.toHaveBeenCalled();
  });

  it("rejects default availability updates with no windows", async () => {
    const result = await updateDefaultAvailabilityAction("email-account-id", {
      timezone: "UTC",
      windows: [],
    });

    expect(result?.validationErrors).toBeDefined();
    expect(prisma.availabilitySchedule.create).not.toHaveBeenCalled();
    expect(prisma.availabilitySchedule.update).not.toHaveBeenCalled();
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
