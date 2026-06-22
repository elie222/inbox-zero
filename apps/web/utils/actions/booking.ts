"use server";

import { SafeError } from "@/utils/error";
import { actionClient } from "@/utils/actions/safe-action";
import {
  createBookingLinkBody,
  deleteBookingLinkBody,
  updateBookingAvailabilityBody,
  updateBookingLinkActionBody,
  updateDefaultAvailabilityBody,
} from "@/utils/actions/booking.validation";
import { getSlotIntervalMinutes } from "@/utils/booking/policy";
import prisma from "@/utils/prisma";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  getProviderVideoLocationType,
  isProviderVideoLocationType,
} from "@/utils/booking/location";

export const createBookingLinkAction = actionClient
  .metadata({ name: "createBookingLink" })
  .inputSchema(createBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await assertNoBookingLinkForAccount({ emailAccountId });
    await assertBookingLinkSlugAvailable({ slug: parsedInput.slug });

    const destinationCalendar = await getOwnedDestinationCalendar({
      emailAccountId,
      destinationCalendarId: parsedInput.destinationCalendarId,
    });
    if (!destinationCalendar) {
      throw new SafeError("Connect your calendar to create a booking link");
    }

    const durationMinutes = parsedInput.durationMinutes;
    const slotIntervalMinutes = getSlotIntervalMinutes(durationMinutes);
    const defaultLocationType =
      getProviderVideoLocationType(destinationCalendar.provider) ??
      BookingLinkLocationType.CUSTOM;
    const locationType = parsedInput.videoEnabled
      ? defaultLocationType
      : BookingLinkLocationType.CUSTOM;
    const defaultAvailabilitySchedule =
      await prisma.availabilitySchedule.findFirst({
        where: { emailAccountId, isDefault: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

    const bookingLink = await prisma.bookingLink.create({
      data: {
        title: parsedInput.title,
        slug: parsedInput.slug,
        description: emptyToNull(parsedInput.description),
        durationMinutes,
        slotIntervalMinutes,
        locationType,
        emailAccount: { connect: { id: emailAccountId } },
        destinationCalendar: { connect: { id: destinationCalendar.id } },
        availabilitySchedule: defaultAvailabilitySchedule
          ? { connect: { id: defaultAvailabilitySchedule.id } }
          : {
              create: {
                name: "Default availability",
                isDefault: true,
                timezone: parsedInput.timezone,
                emailAccount: { connect: { id: emailAccountId } },
                windows: {
                  create: getDefaultWindows(),
                },
              },
            },
      },
      select: { id: true },
    });

    return { id: bookingLink.id };
  });

export const updateBookingLinkAction = actionClient
  .metadata({ name: "updateBookingLink" })
  .inputSchema(updateBookingLinkActionBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const bookingLink = await ensureBookingLinkOwner({
      emailAccountId,
      bookingLinkId: parsedInput.id,
    });

    if (parsedInput.slug) {
      await assertBookingLinkSlugAvailable({
        bookingLinkId: parsedInput.id,
        slug: parsedInput.slug,
      });
    }

    const destinationCalendarId =
      parsedInput.destinationCalendarId === undefined
        ? undefined
        : await getOwnedDestinationCalendar({
            emailAccountId,
            destinationCalendarId: parsedInput.destinationCalendarId,
          });
    const destinationCalendarProvider =
      destinationCalendarId === undefined
        ? bookingLink.destinationCalendar?.connection.provider
        : destinationCalendarId?.provider;
    const locationType = getUpdatedLocationType({
      currentLocationType: bookingLink.locationType,
      requestedLocationType: parsedInput.locationType,
      destinationCalendarProvider,
      destinationCalendarChanged: destinationCalendarId !== undefined,
    });

    await prisma.bookingLink.update({
      where: { id: parsedInput.id },
      data: {
        title: parsedInput.title,
        slug: parsedInput.slug,
        description:
          parsedInput.description === undefined
            ? undefined
            : emptyToNull(parsedInput.description),
        isActive: parsedInput.isActive,
        durationMinutes: parsedInput.durationMinutes,
        slotIntervalMinutes:
          parsedInput.durationMinutes === undefined
            ? undefined
            : getSlotIntervalMinutes(parsedInput.durationMinutes),
        locationType,
        locationValue:
          locationType && isProviderVideoLocationType(locationType)
            ? null
            : parsedInput.locationValue === undefined
              ? undefined
              : emptyToNull(parsedInput.locationValue),
        minimumNoticeMinutes: parsedInput.minimumNoticeMinutes,
        maxDaysAhead: parsedInput.maxDaysAhead,
        ...(destinationCalendarId === undefined
          ? {}
          : { destinationCalendarId: destinationCalendarId?.id ?? null }),
      },
    });

    return { success: true };
  });

export const deleteBookingLinkAction = actionClient
  .metadata({ name: "deleteBookingLink" })
  .inputSchema(deleteBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await ensureBookingLinkOwner({ emailAccountId, bookingLinkId: id });

    await prisma.bookingLink.delete({ where: { id } });

    return { success: true };
  });

export const updateBookingAvailabilityAction = actionClient
  .metadata({ name: "updateBookingAvailability" })
  .inputSchema(updateBookingAvailabilityBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const bookingLink = await ensureBookingLinkOwner({
      emailAccountId,
      bookingLinkId: parsedInput.bookingLinkId,
    });

    await Promise.all([
      prisma.availabilitySchedule.update({
        where: { id: bookingLink.availabilityScheduleId },
        data: {
          timezone: parsedInput.timezone,
          windows: {
            deleteMany: {},
            create: parsedInput.windows,
          },
        },
      }),
      prisma.bookingLink.update({
        where: { id: parsedInput.bookingLinkId },
        data: {
          minimumNoticeMinutes: parsedInput.minimumNoticeMinutes,
        },
      }),
    ]);

    return { success: true };
  });

// Edits the account's default availability schedule directly, independent of a
// booking link. The same schedule constrains AI-suggested meeting times and any
// booking link, so users without a booking link can still set their hours.
export const updateDefaultAvailabilityAction = actionClient
  .metadata({ name: "updateDefaultAvailability" })
  .inputSchema(updateDefaultAvailabilityBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const existingSchedule = await prisma.availabilitySchedule.findFirst({
      where: { emailAccountId, isDefault: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (existingSchedule) {
      await prisma.availabilitySchedule.update({
        where: { id: existingSchedule.id },
        data: {
          timezone: parsedInput.timezone,
          windows: {
            deleteMany: {},
            create: parsedInput.windows,
          },
        },
      });
    } else {
      await prisma.availabilitySchedule.create({
        data: {
          name: "Default availability",
          isDefault: true,
          timezone: parsedInput.timezone,
          emailAccount: { connect: { id: emailAccountId } },
          windows: { create: parsedInput.windows },
        },
      });
    }

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
    select: {
      id: true,
      availabilityScheduleId: true,
      locationType: true,
      destinationCalendar: {
        select: {
          connection: {
            select: { provider: true },
          },
        },
      },
    },
  });

  if (!bookingLink) throw new SafeError("Booking link not found");

  return bookingLink;
}

async function assertNoBookingLinkForAccount({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const existingLink = await prisma.bookingLink.findFirst({
    where: { emailAccountId },
    select: { id: true },
  });

  if (existingLink) {
    throw new SafeError("Booking link already exists");
  }
}

async function getOwnedDestinationCalendar({
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
      select: {
        id: true,
        connection: {
          select: { provider: true },
        },
      },
    });

    return calendar
      ? { id: calendar.id, provider: calendar.connection.provider }
      : null;
  }

  const calendar = await prisma.calendar.findFirst({
    where: {
      id: destinationCalendarId,
      isEnabled: true,
      connection: { emailAccountId, isConnected: true },
    },
    select: {
      id: true,
      connection: {
        select: { provider: true },
      },
    },
  });

  if (!calendar) throw new SafeError("Destination calendar not found");

  return { id: calendar.id, provider: calendar.connection.provider };
}

async function assertBookingLinkSlugAvailable({
  bookingLinkId,
  slug,
}: {
  bookingLinkId?: string;
  slug: string;
}) {
  const conflictingLink = await prisma.bookingLink.findFirst({
    where: {
      ...(bookingLinkId ? { id: { not: bookingLinkId } } : {}),
      slug,
    },
    select: { id: true },
  });

  if (conflictingLink) {
    throw new SafeError("Booking link slug is already in use");
  }
}

function getUpdatedLocationType({
  currentLocationType,
  requestedLocationType,
  destinationCalendarProvider,
  destinationCalendarChanged,
}: {
  currentLocationType: BookingLinkLocationType;
  requestedLocationType?: BookingLinkLocationType;
  destinationCalendarProvider?: string | null;
  destinationCalendarChanged: boolean;
}) {
  const locationType = requestedLocationType ?? currentLocationType;

  if (!isProviderVideoLocationType(locationType)) {
    return requestedLocationType;
  }

  if (!requestedLocationType && !destinationCalendarChanged) {
    return;
  }

  return (
    getProviderVideoLocationType(destinationCalendarProvider) ??
    BookingLinkLocationType.CUSTOM
  );
}

function getDefaultWindows() {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinutes: 9 * 60,
    endMinutes: 17 * 60,
  }));
}

function emptyToNull(value?: string | null) {
  return value?.trim() ? value.trim() : null;
}
