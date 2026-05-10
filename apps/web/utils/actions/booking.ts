"use server";

import { SafeError } from "@/utils/error";
import { actionClient } from "@/utils/actions/safe-action";
import {
  archiveBookingLinkBody,
  createBookingEventTypeBody,
  createBookingLinkBody,
  deleteBookingLinkBody,
  updateBookingAvailabilityBody,
  updateBookingEventTypeBody,
  updateBookingLinkActionBody,
  updateBookingScheduleBody,
} from "@/utils/actions/booking.validation";
import prisma from "@/utils/prisma";
import { BookingEventTypeLocationType } from "@/generated/prisma/enums";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

const DEFAULT_EVENT_TYPE_SLUG = "meeting";

export const createBookingLinkAction = actionClient
  .metadata({ name: "createBookingLink" })
  .inputSchema(createBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await assertBookingLinkSlugAvailable({ slug: parsedInput.slug });

    const destinationCalendarId = await getOwnedDestinationCalendarId({
      emailAccountId,
      destinationCalendarId: parsedInput.destinationCalendarId,
    });
    const organizationId = await getOrganizationId(emailAccountId);
    const durationMinutes = parsedInput.durationMinutes;
    const slotIntervalMinutes =
      parsedInput.slotIntervalMinutes ?? durationMinutes;
    const defaultLocationType =
      await getDefaultLocationTypeForDestinationCalendar(destinationCalendarId);
    const locationType = parsedInput.videoEnabled
      ? defaultLocationType
      : BookingEventTypeLocationType.CUSTOM;

    const bookingLink = await prisma.bookingLink.create({
      data: {
        title: parsedInput.title,
        slug: parsedInput.slug,
        description: emptyToNull(parsedInput.description),
        timezone: parsedInput.timezone,
        emailAccountId,
        organizationId,
        eventTypes: {
          create: {
            title: parsedInput.title,
            slug: DEFAULT_EVENT_TYPE_SLUG,
            durationMinutes,
            slotIntervalMinutes,
            locationType,
            minimumNoticeMinutes: 120,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            bookingWindowDays: 30,
            hosts: {
              create: {
                emailAccount: { connect: { id: emailAccountId } },
                ...(destinationCalendarId
                  ? {
                      destinationCalendar: {
                        connect: { id: destinationCalendarId },
                      },
                    }
                  : {}),
                schedule: {
                  create: {
                    name: `${parsedInput.title} schedule`,
                    timezone: parsedInput.timezone,
                    emailAccount: { connect: { id: emailAccountId } },
                    rules: {
                      create: getDefaultAvailabilityRules(),
                    },
                  },
                },
              },
            },
          },
        },
      },
      include: {
        eventTypes: {
          select: { id: true },
          take: 1,
        },
      },
    });

    const defaultEventTypeId = bookingLink.eventTypes[0]?.id;
    if (defaultEventTypeId) {
      await prisma.bookingLink.update({
        where: { id: bookingLink.id },
        data: { defaultEventTypeId },
      });
    }

    return { id: bookingLink.id, defaultEventTypeId };
  });

export const updateBookingLinkAction = actionClient
  .metadata({ name: "updateBookingLink" })
  .inputSchema(updateBookingLinkActionBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const bookingLink = await ensureBookingLinkOwner({
      emailAccountId,
      bookingLinkId: parsedInput.id,
    });

    if (parsedInput.defaultEventTypeId) {
      await ensureEventTypeForBookingLink({
        bookingLinkId: bookingLink.id,
        eventTypeId: parsedInput.defaultEventTypeId,
      });
    }

    await assertBookingLinkSlugAvailable({
      bookingLinkId: parsedInput.id,
      slug: parsedInput.slug,
      aliasSlug:
        parsedInput.aliasSlug === undefined
          ? undefined
          : emptyToNull(parsedInput.aliasSlug),
    });

    await prisma.bookingLink.update({
      where: { id: parsedInput.id },
      data: {
        title: parsedInput.title,
        slug: parsedInput.slug,
        aliasSlug:
          parsedInput.aliasSlug === undefined
            ? undefined
            : emptyToNull(parsedInput.aliasSlug),
        description:
          parsedInput.description === undefined
            ? undefined
            : emptyToNull(parsedInput.description),
        timezone: parsedInput.timezone,
        isActive: parsedInput.isActive,
        defaultEventTypeId: parsedInput.defaultEventTypeId,
      },
    });

    return { success: true };
  });

export const archiveBookingLinkAction = actionClient
  .metadata({ name: "archiveBookingLink" })
  .inputSchema(archiveBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await ensureBookingLinkOwner({ emailAccountId, bookingLinkId: id });

    await prisma.bookingLink.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  });

export const deleteBookingLinkAction = actionClient
  .metadata({ name: "deleteBookingLink" })
  .inputSchema(deleteBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await ensureBookingLinkOwner({ emailAccountId, bookingLinkId: id });

    const schedules = await prisma.bookingSchedule.findMany({
      where: {
        emailAccountId,
        hosts: {
          some: {
            eventType: {
              bookingLinkId: id,
            },
          },
        },
      },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.bookingLink.delete({
        where: { id },
      }),
      prisma.bookingSchedule.deleteMany({
        where: {
          emailAccountId,
          id: { in: schedules.map((schedule) => schedule.id) },
        },
      }),
    ]);

    return { success: true };
  });

export const createBookingEventTypeAction = actionClient
  .metadata({ name: "createBookingEventType" })
  .inputSchema(createBookingEventTypeBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const bookingLink = await ensureBookingLinkOwner({
      emailAccountId,
      bookingLinkId: parsedInput.bookingLinkId,
    });
    const destinationCalendarId = await getOwnedDestinationCalendarId({
      emailAccountId,
      destinationCalendarId: parsedInput.destinationCalendarId,
    });

    const eventType = await prisma.bookingEventType.create({
      data: {
        bookingLinkId: parsedInput.bookingLinkId,
        title: parsedInput.title,
        slug: parsedInput.slug,
        description: emptyToNull(parsedInput.description),
        durationMinutes: parsedInput.durationMinutes,
        slotIntervalMinutes: parsedInput.slotIntervalMinutes,
        locationType: parsedInput.locationType,
        locationValue: emptyToNull(parsedInput.locationValue),
        minimumNoticeMinutes: parsedInput.minimumNoticeMinutes,
        bufferBeforeMinutes: parsedInput.bufferBeforeMinutes,
        bufferAfterMinutes: parsedInput.bufferAfterMinutes,
        bookingWindowDays: parsedInput.bookingWindowDays,
        maxActiveBookingsPerGuest:
          parsedInput.maxActiveBookingsPerGuest ?? null,
        disableCancelling: parsedInput.disableCancelling,
        hideHostEmail: parsedInput.hideHostEmail,
        hideCalendarEventDetails: parsedInput.hideCalendarEventDetails,
        isActive: parsedInput.isActive,
        hosts: {
          create: {
            emailAccount: { connect: { id: emailAccountId } },
            ...(destinationCalendarId
              ? {
                  destinationCalendar: {
                    connect: { id: destinationCalendarId },
                  },
                }
              : {}),
            schedule: {
              create: {
                name: `${parsedInput.title} schedule`,
                timezone: bookingLink.timezone,
                emailAccount: { connect: { id: emailAccountId } },
                rules: {
                  create: getDefaultAvailabilityRules(),
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!bookingLink.defaultEventTypeId) {
      await prisma.bookingLink.update({
        where: { id: bookingLink.id },
        data: { defaultEventTypeId: eventType.id },
      });
    }

    return eventType;
  });

export const updateBookingEventTypeAction = actionClient
  .metadata({ name: "updateBookingEventType" })
  .inputSchema(updateBookingEventTypeBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await ensureEventTypeOwner({
      emailAccountId,
      eventTypeId: parsedInput.id,
    });

    const destinationCalendarId =
      parsedInput.destinationCalendarId === undefined
        ? undefined
        : await getOwnedDestinationCalendarId({
            emailAccountId,
            destinationCalendarId: parsedInput.destinationCalendarId,
          });

    await prisma.bookingEventType.update({
      where: { id: parsedInput.id },
      data: {
        title: parsedInput.title,
        slug: parsedInput.slug,
        description:
          parsedInput.description === undefined
            ? undefined
            : emptyToNull(parsedInput.description),
        durationMinutes: parsedInput.durationMinutes,
        slotIntervalMinutes: parsedInput.slotIntervalMinutes,
        locationType: parsedInput.locationType,
        locationValue:
          parsedInput.locationValue === undefined
            ? undefined
            : emptyToNull(parsedInput.locationValue),
        minimumNoticeMinutes: parsedInput.minimumNoticeMinutes,
        bufferBeforeMinutes: parsedInput.bufferBeforeMinutes,
        bufferAfterMinutes: parsedInput.bufferAfterMinutes,
        bookingWindowDays: parsedInput.bookingWindowDays,
        maxActiveBookingsPerGuest: parsedInput.maxActiveBookingsPerGuest,
        disableCancelling: parsedInput.disableCancelling,
        hideHostEmail: parsedInput.hideHostEmail,
        hideCalendarEventDetails: parsedInput.hideCalendarEventDetails,
        isActive: parsedInput.isActive,
      },
    });

    if (destinationCalendarId !== undefined) {
      await prisma.bookingEventTypeHost.updateMany({
        where: {
          eventTypeId: parsedInput.id,
          emailAccountId,
          isActive: true,
        },
        data: { destinationCalendarId },
      });
    }

    return { success: true };
  });

export const updateBookingScheduleAction = actionClient
  .metadata({ name: "updateBookingSchedule" })
  .inputSchema(updateBookingScheduleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await ensureScheduleOwner({
      emailAccountId,
      scheduleId: parsedInput.id,
    });

    await prisma.bookingSchedule.update({
      where: { id: parsedInput.id },
      data: {
        timezone: parsedInput.timezone,
        rules: {
          deleteMany: {},
          create: parsedInput.rules,
        },
      },
    });

    return { success: true };
  });

export const updateBookingAvailabilityAction = actionClient
  .metadata({ name: "updateBookingAvailability" })
  .inputSchema(updateBookingAvailabilityBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await ensureEventTypeScheduleOwner({
      emailAccountId,
      eventTypeId: parsedInput.eventTypeId,
      scheduleId: parsedInput.scheduleId,
    });

    await prisma.$transaction([
      prisma.bookingEventType.update({
        where: { id: parsedInput.eventTypeId },
        data: { minimumNoticeMinutes: parsedInput.minimumNoticeMinutes },
      }),
      prisma.bookingSchedule.update({
        where: { id: parsedInput.scheduleId },
        data: {
          timezone: parsedInput.timezone,
          rules: {
            deleteMany: {},
            create: parsedInput.rules,
          },
        },
      }),
    ]);

    return { success: true };
  });

async function ensureBookingLinkOwner({
  emailAccountId,
  bookingLinkId,
}: {
  emailAccountId: string;
  bookingLinkId: string;
}) {
  const bookingLink = await prisma.bookingLink.findFirst({
    where: { id: bookingLinkId, emailAccountId },
    select: { id: true, defaultEventTypeId: true, timezone: true },
  });

  if (!bookingLink) throw new SafeError("Booking link not found");

  return bookingLink;
}

async function ensureEventTypeOwner({
  emailAccountId,
  eventTypeId,
}: {
  emailAccountId: string;
  eventTypeId: string;
}) {
  const eventType = await prisma.bookingEventType.findFirst({
    where: {
      id: eventTypeId,
      bookingLink: { emailAccountId },
    },
    select: { id: true },
  });

  if (!eventType) throw new SafeError("Booking event type not found");
}

async function ensureEventTypeForBookingLink({
  bookingLinkId,
  eventTypeId,
}: {
  bookingLinkId: string;
  eventTypeId: string;
}) {
  const eventType = await prisma.bookingEventType.findFirst({
    where: {
      id: eventTypeId,
      bookingLinkId,
    },
    select: { id: true },
  });

  if (!eventType) throw new SafeError("Booking event type not found");
}

async function ensureScheduleOwner({
  emailAccountId,
  scheduleId,
}: {
  emailAccountId: string;
  scheduleId: string;
}) {
  const schedule = await prisma.bookingSchedule.findFirst({
    where: { id: scheduleId, emailAccountId },
    select: { id: true },
  });

  if (!schedule) throw new SafeError("Booking schedule not found");
}

async function ensureEventTypeScheduleOwner({
  emailAccountId,
  eventTypeId,
  scheduleId,
}: {
  emailAccountId: string;
  eventTypeId: string;
  scheduleId: string;
}) {
  const host = await prisma.bookingEventTypeHost.findFirst({
    where: {
      eventTypeId,
      scheduleId,
      emailAccountId,
      eventType: { bookingLink: { emailAccountId } },
      schedule: { emailAccountId },
    },
    select: { id: true },
  });

  if (!host) throw new SafeError("Booking availability not found");
}

async function getOwnedDestinationCalendarId({
  emailAccountId,
  destinationCalendarId,
}: {
  emailAccountId: string;
  destinationCalendarId?: string | null;
}) {
  if (!destinationCalendarId) {
    const calendar = await prisma.calendar.findFirst({
      where: {
        isEnabled: true,
        connection: { emailAccountId, isConnected: true },
      },
      orderBy: [{ primary: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    return calendar?.id ?? null;
  }

  const calendar = await prisma.calendar.findFirst({
    where: {
      id: destinationCalendarId,
      connection: { emailAccountId, isConnected: true },
    },
    select: { id: true },
  });

  if (!calendar) throw new SafeError("Destination calendar not found");

  return calendar.id;
}

async function assertBookingLinkSlugAvailable({
  bookingLinkId,
  slug,
  aliasSlug,
}: {
  bookingLinkId?: string;
  slug?: string;
  aliasSlug?: string | null;
}) {
  const candidates = [slug, aliasSlug].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  for (const candidate of candidates) {
    const conflictingLink = await prisma.bookingLink.findFirst({
      where: {
        ...(bookingLinkId ? { id: { not: bookingLinkId } } : {}),
        OR: [{ slug: candidate }, { aliasSlug: candidate }],
      },
      select: { id: true },
    });

    if (conflictingLink) {
      throw new SafeError("Booking link slug is already in use");
    }
  }
}

async function getOrganizationId(emailAccountId: string) {
  const member = await prisma.member.findUnique({
    where: { emailAccountId },
    select: { organizationId: true },
  });

  return member?.organizationId ?? null;
}

async function getDefaultLocationTypeForDestinationCalendar(
  destinationCalendarId: string | null,
) {
  if (!destinationCalendarId) return BookingEventTypeLocationType.CUSTOM;

  const calendar = await prisma.calendar.findUnique({
    where: { id: destinationCalendarId },
    select: {
      connection: {
        select: { provider: true },
      },
    },
  });

  return getProviderVideoLocationType(calendar?.connection.provider);
}

function getProviderVideoLocationType(provider: string | null | undefined) {
  if (isGoogleProvider(provider)) {
    return BookingEventTypeLocationType.GOOGLE_MEET;
  }
  if (isMicrosoftProvider(provider)) {
    return BookingEventTypeLocationType.MICROSOFT_TEAMS;
  }
  return BookingEventTypeLocationType.CUSTOM;
}

function getDefaultAvailabilityRules() {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  }));
}

function emptyToNull(value?: string | null) {
  return value?.trim() ? value.trim() : null;
}
