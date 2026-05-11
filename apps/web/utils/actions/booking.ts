"use server";

import { SafeError } from "@/utils/error";
import { actionClient } from "@/utils/actions/safe-action";
import {
  createBookingLinkBody,
  deleteBookingLinkBody,
  updateBookingAvailabilityBody,
  updateBookingLinkActionBody,
} from "@/utils/actions/booking.validation";
import prisma from "@/utils/prisma";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

export const createBookingLinkAction = actionClient
  .metadata({ name: "createBookingLink" })
  .inputSchema(createBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await assertNoBookingLinkForAccount({ emailAccountId });
    await assertBookingLinkSlugAvailable({ slug: parsedInput.slug });

    const destinationCalendarId = await getOwnedDestinationCalendarId({
      emailAccountId,
      destinationCalendarId: parsedInput.destinationCalendarId,
    });
    if (!destinationCalendarId) {
      throw new SafeError("Connect your calendar to create a booking link");
    }

    const durationMinutes = parsedInput.durationMinutes;
    const slotIntervalMinutes =
      parsedInput.slotIntervalMinutes ?? durationMinutes;
    const defaultLocationType =
      await getDefaultLocationTypeForDestinationCalendar(destinationCalendarId);
    const locationType = parsedInput.videoEnabled
      ? defaultLocationType
      : BookingLinkLocationType.CUSTOM;

    const bookingLink = await prisma.bookingLink.create({
      data: {
        title: parsedInput.title,
        slug: parsedInput.slug,
        description: emptyToNull(parsedInput.description),
        timezone: parsedInput.timezone,
        durationMinutes,
        slotIntervalMinutes,
        locationType,
        emailAccountId,
        ...(destinationCalendarId ? { destinationCalendarId } : {}),
        windows: {
          create: getDefaultWindows(),
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
    await ensureBookingLinkOwner({
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
        : await getOwnedDestinationCalendarId({
            emailAccountId,
            destinationCalendarId: parsedInput.destinationCalendarId,
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
        timezone: parsedInput.timezone,
        isActive: parsedInput.isActive,
        durationMinutes: parsedInput.durationMinutes,
        slotIntervalMinutes: parsedInput.slotIntervalMinutes,
        locationType: parsedInput.locationType,
        locationValue:
          parsedInput.locationValue === undefined
            ? undefined
            : emptyToNull(parsedInput.locationValue),
        minimumNoticeMinutes: parsedInput.minimumNoticeMinutes,
        maxDaysAhead: parsedInput.maxDaysAhead,
        ...(destinationCalendarId === undefined
          ? {}
          : { destinationCalendarId }),
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
    await ensureBookingLinkOwner({
      emailAccountId,
      bookingLinkId: parsedInput.bookingLinkId,
    });

    await prisma.bookingLink.update({
      where: { id: parsedInput.bookingLinkId },
      data: {
        timezone: parsedInput.timezone,
        minimumNoticeMinutes: parsedInput.minimumNoticeMinutes,
        windows: {
          deleteMany: {},
          create: parsedInput.windows,
        },
      },
    });

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
    select: { id: true },
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
      isEnabled: true,
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

async function getDefaultLocationTypeForDestinationCalendar(
  destinationCalendarId: string | null,
) {
  if (!destinationCalendarId) return BookingLinkLocationType.CUSTOM;

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
    return BookingLinkLocationType.GOOGLE_MEET;
  }
  if (isMicrosoftProvider(provider)) {
    return BookingLinkLocationType.MICROSOFT_TEAMS;
  }
  return BookingLinkLocationType.CUSTOM;
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
