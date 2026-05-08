import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { BookingEventTypeLocationType } from "@/generated/prisma/enums";
import {
  createBookingLinkAction,
  deleteBookingLinkAction,
  updateBookingEventTypeAction,
  updateBookingLinkAction,
  updateBookingScheduleAction,
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

  it("creates a booking link with a provider video event type and default schedule", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({ id: "calendar-id" } as any);
    prisma.calendar.findUnique.mockResolvedValue({
      connection: { provider: "microsoft" },
    } as any);
    prisma.member.findUnique.mockResolvedValue({
      organizationId: "organization-id",
    } as any);
    prisma.bookingLink.create.mockResolvedValue({
      id: "booking-link-id",
      eventTypes: [{ id: "event-type-id" }],
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

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
          organizationId: "organization-id",
          slug: "intro-call",
          eventTypes: {
            create: expect.objectContaining({
              durationMinutes: 30,
              locationType: BookingEventTypeLocationType.MICROSOFT_TEAMS,
              slotIntervalMinutes: 30,
              slug: "meeting",
              hosts: {
                create: expect.objectContaining({
                  destinationCalendar: {
                    connect: { id: "calendar-id" },
                  },
                  schedule: {
                    create: expect.objectContaining({
                      timezone: "UTC",
                      rules: {
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
              },
            }),
          },
        }),
      }),
    );
    expect(prisma.bookingLink.update).toHaveBeenCalledWith({
      where: { id: "booking-link-id" },
      data: { defaultEventTypeId: "event-type-id" },
    });
  });

  it("rejects an alias that conflicts with another link slug", async () => {
    prisma.bookingLink.findFirst
      .mockResolvedValueOnce({
        id: "booking-link-id",
        defaultEventTypeId: "event-type-id",
        timezone: "UTC",
      } as any)
      .mockResolvedValueOnce({ id: "other-link-id" } as any);

    const result = await updateBookingLinkAction("email-account-id", {
      id: "booking-link-id",
      aliasSlug: "other-link",
    });

    expect(result?.serverError).toBe("Booking link slug is already in use");
    expect(prisma.bookingLink.update).not.toHaveBeenCalled();
  });

  it("creates a booking link without provider video when disabled", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue(null);
    prisma.calendar.findFirst.mockResolvedValue({ id: "calendar-id" } as any);
    prisma.calendar.findUnique.mockResolvedValue({
      connection: { provider: "microsoft" },
    } as any);
    prisma.member.findUnique.mockResolvedValue({
      organizationId: "organization-id",
    } as any);
    prisma.bookingLink.create.mockResolvedValue({
      id: "booking-link-id",
      eventTypes: [{ id: "event-type-id" }],
    } as any);
    prisma.bookingLink.update.mockResolvedValue({} as any);

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
          eventTypes: {
            create: expect.objectContaining({
              locationType: BookingEventTypeLocationType.CUSTOM,
            }),
          },
        }),
      }),
    );
  });

  it("rejects event type updates to calendars outside the account", async () => {
    prisma.bookingEventType.findFirst.mockResolvedValue({
      id: "event-type-id",
    } as any);
    prisma.calendar.findFirst.mockResolvedValue(null);

    const result = await updateBookingEventTypeAction("email-account-id", {
      id: "event-type-id",
      destinationCalendarId: "other-calendar-id",
    });

    expect(result?.serverError).toBe("Destination calendar not found");
    expect(prisma.bookingEventType.update).not.toHaveBeenCalled();
    expect(prisma.bookingEventTypeHost.updateMany).not.toHaveBeenCalled();
  });

  it("updates event type minimum notice", async () => {
    prisma.bookingEventType.findFirst.mockResolvedValue({
      id: "event-type-id",
    } as any);
    prisma.bookingEventType.update.mockResolvedValue({} as any);

    const result = await updateBookingEventTypeAction("email-account-id", {
      id: "event-type-id",
      minimumNoticeMinutes: 4 * 60,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingEventType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event-type-id" },
        data: expect.objectContaining({
          minimumNoticeMinutes: 240,
        }),
      }),
    );
  });

  it("replaces owned schedule rules atomically in one update call", async () => {
    prisma.bookingSchedule.findFirst.mockResolvedValue({
      id: "schedule-id",
    } as any);
    prisma.bookingSchedule.update.mockResolvedValue({} as any);

    const rules = [
      { weekday: 1, startMinutes: 9 * 60, endMinutes: 12 * 60 },
      { weekday: 3, startMinutes: 13 * 60, endMinutes: 17 * 60 },
    ];
    const result = await updateBookingScheduleAction("email-account-id", {
      id: "schedule-id",
      timezone: "America/New_York",
      rules,
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingSchedule.update).toHaveBeenCalledWith({
      where: { id: "schedule-id" },
      data: {
        timezone: "America/New_York",
        rules: {
          deleteMany: {},
          create: rules,
        },
      },
    });
  });

  it("rejects invalid event type payloads before writing", async () => {
    const result = await updateBookingEventTypeAction("email-account-id", {
      id: "event-type-id",
      locationType: "NOT_A_LOCATION" as BookingEventTypeLocationType,
    });

    expect(result?.validationErrors).toBeDefined();
    expect(prisma.bookingEventType.findFirst).not.toHaveBeenCalled();
    expect(prisma.bookingEventType.update).not.toHaveBeenCalled();
  });

  it("deletes an owned booking link and its schedules", async () => {
    prisma.bookingLink.findFirst.mockResolvedValue({
      id: "booking-link-id",
      defaultEventTypeId: "event-type-id",
      timezone: "UTC",
    } as any);
    prisma.bookingSchedule.findMany.mockResolvedValue([
      { id: "schedule-id" },
    ] as any);
    prisma.bookingLink.delete.mockResolvedValue({} as any);
    prisma.bookingSchedule.deleteMany.mockResolvedValue({ count: 1 } as any);
    prisma.$transaction.mockResolvedValue([] as any);

    const result = await deleteBookingLinkAction("email-account-id", {
      id: "booking-link-id",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.bookingSchedule.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        hosts: {
          some: {
            eventType: {
              bookingLinkId: "booking-link-id",
            },
          },
        },
      },
      select: { id: true },
    });
    expect(prisma.bookingLink.delete).toHaveBeenCalledWith({
      where: { id: "booking-link-id" },
    });
    expect(prisma.bookingSchedule.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        id: { in: ["schedule-id"] },
      },
    });
  });
});
