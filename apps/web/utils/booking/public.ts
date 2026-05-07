import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { addMinutes } from "date-fns";
import {
  generateBookableSlots,
  validateSelectedSlot,
  type AvailabilityRule,
  type BusyPeriod,
  type DateOverride,
} from "@inboxzero/scheduling";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import {
  cancelCalendarEvent,
  createCalendarEvent,
} from "@/utils/calendar/event-writer";
import type { CalendarEventLocationType } from "@/utils/calendar/event-types";
import {
  BookingCanceledBy,
  BookingCreationSource,
  BookingStatus,
} from "@/generated/prisma/enums";
import type { PublicBookingBody } from "@/utils/actions/booking.validation";
import {
  sendBookingCancellationEmails,
  sendBookingConfirmationEmails,
} from "@/utils/booking/emails";

const MAX_AVAILABILITY_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const SLOT_LOCK_TTL_MS = 5 * 60 * 1000;
const CALENDAR_AVAILABILITY_UNAVAILABLE =
  "Calendar availability is temporarily unavailable";

export async function getPublicBookingLinkMetadata(slug: string) {
  const bookingLink = await prisma.bookingLink.findFirst({
    where: {
      OR: [{ slug }, { aliasSlug: slug }],
      isActive: true,
    },
    select: {
      slug: true,
      aliasSlug: true,
      title: true,
      description: true,
      timezone: true,
      defaultEventTypeId: true,
      eventTypes: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          durationMinutes: true,
          slotIntervalMinutes: true,
          locationType: true,
          locationValue: true,
          disableCancelling: true,
          hideHostEmail: true,
          hideCalendarEventDetails: true,
          hosts: {
            where: { isActive: true },
            select: {
              emailAccount: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!bookingLink) throw new SafeError("Booking link not found", 404);

  return {
    slug: bookingLink.slug,
    aliasSlug: bookingLink.aliasSlug,
    title: bookingLink.title,
    description: bookingLink.description,
    timezone: bookingLink.timezone,
    defaultEventTypeId: bookingLink.defaultEventTypeId,
    eventTypes: bookingLink.eventTypes.map((eventType) => {
      const host = getSingleHost(eventType.hosts);

      return {
        id: eventType.id,
        slug: eventType.slug,
        title: eventType.title,
        description: eventType.description,
        durationMinutes: eventType.durationMinutes,
        slotIntervalMinutes: eventType.slotIntervalMinutes,
        locationType: eventType.locationType,
        locationValue: eventType.hideCalendarEventDetails
          ? null
          : eventType.locationValue,
        disableCancelling: eventType.disableCancelling,
        hostEmail: eventType.hideHostEmail ? null : host?.emailAccount.email,
        hostName: host?.emailAccount.name ?? null,
      };
    }),
  };
}

export async function getPublicAvailability({
  slug,
  eventTypeSlug,
  start,
  end,
  now = new Date(),
  logger,
}: {
  slug: string;
  eventTypeSlug: string;
  start: Date;
  end: Date;
  now?: Date;
  logger: Logger;
}) {
  assertAvailabilityRange(start, end);

  const config = await loadPublicEventType({ slug, eventTypeSlug });
  const busyPeriods = await getBusyPeriods({
    config,
    start,
    end,
    logger,
    providerFailureMode: "return-null",
  });

  if (!busyPeriods) return [];

  return generateBookableSlots({
    now,
    timezone: config.schedule.timezone,
    start,
    end,
    rules: config.schedule.rules,
    dateOverrides: config.schedule.dateOverrides,
    busyPeriods,
    policy: getPolicy(config.eventType),
  });
}

export async function createPublicBooking({
  input,
  logger,
}: {
  input: PublicBookingBody;
  logger: Logger;
}) {
  const selectedStartTime = new Date(input.startTime);
  if (Number.isNaN(selectedStartTime.getTime())) {
    throw new SafeError("Invalid start time");
  }

  const config = await loadPublicEventType({
    slug: input.slug,
    eventTypeSlug: input.eventTypeSlug,
  });
  const selectedEndTime = addMinutes(
    selectedStartTime,
    config.eventType.durationMinutes,
  );

  const existingBooking = await findIdempotentBooking({
    eventTypeId: config.eventType.id,
    idempotencyToken: input.idempotencyToken,
  });
  if (existingBooking) return toPublicBookingResult(existingBooking);

  const busyPeriods = await getBusyPeriods({
    config,
    start: selectedStartTime,
    end: selectedEndTime,
    logger,
    providerFailureMode: "throw-safe-error",
  });

  if (!busyPeriods) throw new SafeError(CALENDAR_AVAILABILITY_UNAVAILABLE);

  const slotValidation = validateSelectedSlot({
    now: new Date(),
    timezone: config.schedule.timezone,
    start: selectedStartTime,
    end: selectedEndTime,
    selectedStartTime,
    rules: config.schedule.rules,
    dateOverrides: config.schedule.dateOverrides,
    busyPeriods,
    policy: getPolicy(config.eventType),
  });

  if (!slotValidation.valid) {
    throw new SafeError(slotValidation.reason);
  }

  await enforceGuestBookingLimit({
    eventTypeId: config.eventType.id,
    guestEmail: input.guestEmail,
    maxActiveBookingsPerGuest: config.eventType.maxActiveBookingsPerGuest,
  });

  const slotLock = await acquireSlotLock({
    eventTypeId: config.eventType.id,
    startTime: selectedStartTime,
    endTime: selectedEndTime,
  });
  const cancelToken = randomToken();

  let booking = await createPendingBooking({
    config,
    input,
    selectedStartTime,
    selectedEndTime,
    cancelToken,
  }).catch(async (error) => {
    await prisma.bookingSlotLock.delete({ where: { id: slotLock.id } });

    if (isDuplicateError(error)) {
      const booking = await findIdempotentBooking({
        eventTypeId: config.eventType.id,
        idempotencyToken: input.idempotencyToken,
      });
      if (booking) return booking;
    }

    throw error;
  });

  await prisma.bookingSlotLock.update({
    where: { id: slotLock.id },
    data: { bookingId: booking.id },
  });

  try {
    const createdEvent = await createCalendarEvent({
      emailAccountId: config.host.emailAccountId,
      destinationCalendarId: config.host.destinationCalendarId,
      title: config.eventType.title,
      description: getProviderEventDescription({
        hideCalendarEventDetails: config.eventType.hideCalendarEventDetails,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestNote: input.guestNote,
      }),
      startTime: selectedStartTime,
      endTime: selectedEndTime,
      timezone: config.schedule.timezone,
      attendees: [
        { name: input.guestName, email: input.guestEmail },
        ...(input.guestAdditionalEmails ?? []).map((email) => ({ email })),
      ],
      locationType: config.eventType.locationType as CalendarEventLocationType,
      locationValue: config.eventType.locationValue,
      logger,
    });

    booking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        provider: createdEvent.provider,
        providerCalendarId: createdEvent.providerCalendarId,
        providerEventId: createdEvent.id,
        status: BookingStatus.CONFIRMED,
      },
      include: getBookingEmailInclude(),
    });
  } catch (error) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.FAILED },
    });
    await prisma.bookingSlotLock.delete({ where: { id: slotLock.id } });
    logger.error("Failed to create provider event for booking", {
      bookingId: booking.id,
      error,
    });
    throw new SafeError("Failed to create calendar event");
  }

  await sendBookingConfirmationEmails({
    booking,
    cancelUrl: getCancelUrl({ uid: booking.uid, token: cancelToken }),
    logger,
  });

  return {
    ...toPublicBookingResult(booking),
    cancelUrl: getCancelUrl({ uid: booking.uid, token: cancelToken }),
  };
}

export async function cancelPublicBooking({
  uid,
  token,
  reason,
  logger,
}: {
  uid: string;
  token: string;
  reason?: string;
  logger: Logger;
}) {
  const booking = await prisma.booking.findUnique({
    where: { uid },
    include: getBookingEmailInclude(),
  });

  if (!booking) throw new SafeError("Booking not found", 404);
  if (!isMatchingToken({ token, tokenHash: booking.cancelTokenHash })) {
    throw new SafeError("Invalid cancellation token", 403);
  }
  if (booking.status === BookingStatus.CANCELED) {
    throw new SafeError("Booking is already canceled");
  }
  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new SafeError("Booking cannot be canceled");
  }
  if (booking.startTime <= new Date()) {
    throw new SafeError("Bookings that have started cannot be canceled");
  }
  if (booking.eventType.disableCancelling) {
    throw new SafeError("Cancellation is disabled for this booking");
  }

  if (
    booking.provider &&
    booking.providerCalendarId &&
    booking.providerEventId
  ) {
    await cancelCalendarEvent({
      emailAccountId: booking.emailAccountId,
      provider: booking.provider,
      providerCalendarId: booking.providerCalendarId,
      providerEventId: booking.providerEventId,
      logger,
    });
  }

  const canceledBooking = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.CANCELED,
      cancellationReason: reason || null,
      canceledBy: BookingCanceledBy.GUEST,
    },
    include: getBookingEmailInclude(),
  });

  await sendBookingCancellationEmails({
    booking: canceledBooking,
    logger,
  });

  return toPublicBookingResult(canceledBooking);
}

function getBookingEmailInclude() {
  return {
    eventType: {
      include: {
        hosts: {
          where: { isActive: true },
          include: {
            emailAccount: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
      },
    },
  } as const;
}

async function loadPublicEventType({
  slug,
  eventTypeSlug,
}: {
  slug: string;
  eventTypeSlug: string;
}) {
  const bookingLink = await prisma.bookingLink.findFirst({
    where: {
      OR: [{ slug }, { aliasSlug: slug }],
      isActive: true,
    },
    select: {
      id: true,
      eventTypes: {
        where: {
          slug: eventTypeSlug,
          isActive: true,
        },
        select: {
          id: true,
          title: true,
          durationMinutes: true,
          slotIntervalMinutes: true,
          locationType: true,
          locationValue: true,
          minimumNoticeMinutes: true,
          bufferBeforeMinutes: true,
          bufferAfterMinutes: true,
          bookingWindowDays: true,
          maxActiveBookingsPerGuest: true,
          disableCancelling: true,
          hideCalendarEventDetails: true,
          hosts: {
            where: { isActive: true },
            select: {
              id: true,
              emailAccountId: true,
              destinationCalendarId: true,
              schedule: {
                select: {
                  timezone: true,
                  rules: {
                    select: {
                      weekday: true,
                      startMinutes: true,
                      endMinutes: true,
                    },
                  },
                  dateOverrides: {
                    select: {
                      date: true,
                      type: true,
                    },
                  },
                },
              },
              emailAccount: {
                select: {
                  calendarConnections: {
                    where: { isConnected: true },
                    select: {
                      id: true,
                      calendars: {
                        where: { isEnabled: true },
                        select: { id: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const eventType = bookingLink?.eventTypes[0];
  if (!bookingLink || !eventType) {
    throw new SafeError("Booking event type not found", 404);
  }

  const host = getSingleHost(eventType.hosts);
  if (!host) {
    throw new SafeError("Booking event type is not configured");
  }

  const hasEnabledCalendar = host.emailAccount.calendarConnections.some(
    (connection) => connection.calendars.length > 0,
  );
  if (!hasEnabledCalendar) {
    throw new SafeError("No enabled calendar is available for this host");
  }

  return {
    eventType,
    host,
    schedule: {
      timezone: host.schedule.timezone,
      rules: host.schedule.rules.map((rule) => ({
        weekday: rule.weekday,
        startMinutes: rule.startMinutes,
        endMinutes: rule.endMinutes,
      })) satisfies AvailabilityRule[],
      dateOverrides: host.schedule.dateOverrides.map((override) => ({
        date: override.date,
        type: "BLOCKED",
      })) satisfies DateOverride[],
    },
  };
}

async function getBusyPeriods({
  config,
  start,
  end,
  logger,
  providerFailureMode,
}: {
  config: Awaited<ReturnType<typeof loadPublicEventType>>;
  start: Date;
  end: Date;
  logger: Logger;
  providerFailureMode: "return-null" | "throw-safe-error";
}): Promise<BusyPeriod[] | null> {
  const [providerBusyPeriods, existingBookings] = await Promise.all([
    getUnifiedCalendarAvailability({
      emailAccountId: config.host.emailAccountId,
      startDate: start,
      endDate: end,
      timezone: config.schedule.timezone,
      logger,
      failClosed: true,
    }).catch((error) => {
      logger.error("Failed to load provider availability for public booking", {
        error,
      });

      if (providerFailureMode === "return-null") return null;

      throw new SafeError(CALENDAR_AVAILABILITY_UNAVAILABLE);
    }),
    prisma.booking.findMany({
      where: {
        eventTypeId: config.eventType.id,
        status: {
          in: [BookingStatus.PENDING_PROVIDER_EVENT, BookingStatus.CONFIRMED],
        },
        startTime: { lt: end },
        endTime: { gt: start },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    }),
  ]);

  if (!providerBusyPeriods) return null;

  return [
    ...providerBusyPeriods,
    ...existingBookings.map((booking) => ({
      start: booking.startTime,
      end: booking.endTime,
    })),
  ];
}

function getPolicy(eventType: {
  bookingWindowDays: number;
  bufferAfterMinutes: number;
  bufferBeforeMinutes: number;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  slotIntervalMinutes: number;
}) {
  return {
    durationMinutes: eventType.durationMinutes,
    slotIntervalMinutes: eventType.slotIntervalMinutes,
    minimumNoticeMinutes: eventType.minimumNoticeMinutes,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes,
    bufferAfterMinutes: eventType.bufferAfterMinutes,
    bookingWindowDays: eventType.bookingWindowDays,
  };
}

async function acquireSlotLock({
  eventTypeId,
  startTime,
  endTime,
}: {
  eventTypeId: string;
  startTime: Date;
  endTime: Date;
}) {
  await prisma.bookingSlotLock.deleteMany({
    where: {
      eventTypeId,
      bookingId: null,
      expiresAt: { lt: new Date() },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  try {
    return await prisma.bookingSlotLock.create({
      data: {
        eventTypeId,
        startTime,
        endTime,
        expiresAt: new Date(Date.now() + SLOT_LOCK_TTL_MS),
      },
      select: { id: true },
    });
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new SafeError("Selected slot is no longer available");
    }
    throw error;
  }
}

async function createPendingBooking({
  config,
  input,
  selectedStartTime,
  selectedEndTime,
  cancelToken,
}: {
  config: Awaited<ReturnType<typeof loadPublicEventType>>;
  input: PublicBookingBody;
  selectedStartTime: Date;
  selectedEndTime: Date;
  cancelToken: string;
}) {
  return prisma.booking.create({
    data: {
      uid: randomToken(),
      eventTypeId: config.eventType.id,
      emailAccountId: config.host.emailAccountId,
      guestName: input.guestName,
      guestEmail: input.guestEmail.toLowerCase(),
      guestAdditionalEmails: (input.guestAdditionalEmails ?? []).map((email) =>
        email.toLowerCase(),
      ),
      guestNote: input.guestNote,
      startTime: selectedStartTime,
      endTime: selectedEndTime,
      timezone: input.timezone,
      status: BookingStatus.PENDING_PROVIDER_EVENT,
      cancelTokenHash: hashToken(cancelToken),
      creationSource: BookingCreationSource.PUBLIC,
      idempotencyToken: input.idempotencyToken,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      utmTerm: input.utmTerm,
      utmContent: input.utmContent,
      eventTypeTitle: config.eventType.title,
      eventTypeDurationMinutes: config.eventType.durationMinutes,
      eventTypeLocationType: config.eventType.locationType,
      eventTypeLocationValue: config.eventType.locationValue,
      eventTypeTimezone: config.schedule.timezone,
    },
    include: getBookingEmailInclude(),
  });
}

async function findIdempotentBooking({
  eventTypeId,
  idempotencyToken,
}: {
  eventTypeId: string;
  idempotencyToken: string;
}) {
  return prisma.booking.findFirst({
    where: { eventTypeId, idempotencyToken },
    include: getBookingEmailInclude(),
  });
}

async function enforceGuestBookingLimit({
  eventTypeId,
  guestEmail,
  maxActiveBookingsPerGuest,
}: {
  eventTypeId: string;
  guestEmail: string;
  maxActiveBookingsPerGuest: number | null;
}) {
  if (!maxActiveBookingsPerGuest) return;

  const count = await prisma.booking.count({
    where: {
      eventTypeId,
      guestEmail: guestEmail.toLowerCase(),
      status: {
        in: [BookingStatus.PENDING_PROVIDER_EVENT, BookingStatus.CONFIRMED],
      },
    },
  });

  if (count >= maxActiveBookingsPerGuest) {
    throw new SafeError("Guest has reached the booking limit");
  }
}

function getProviderEventDescription({
  hideCalendarEventDetails,
  guestName,
  guestEmail,
  guestNote,
}: {
  hideCalendarEventDetails: boolean;
  guestName: string;
  guestEmail: string;
  guestNote?: string;
}) {
  if (hideCalendarEventDetails) {
    return "Booked via Inbox Zero.";
  }

  return [
    `Booked with ${guestName}`,
    `Guest email: ${guestEmail}`,
    guestNote ? `Guest note: ${guestNote}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function toPublicBookingResult(booking: {
  endTime: Date;
  startTime: Date;
  status: BookingStatus;
  uid: string;
}) {
  return {
    uid: booking.uid,
    status: booking.status,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
  };
}

function assertAvailabilityRange(start: Date, end: Date) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new SafeError("Invalid date range");
  }
  if (end <= start) throw new SafeError("Invalid date range");
  if (end.getTime() - start.getTime() > MAX_AVAILABILITY_RANGE_MS) {
    throw new SafeError("Availability range must be 31 days or less");
  }
}

function getSingleHost<T>(hosts: T[]): T | null {
  return hosts.length === 1 ? hosts[0] : null;
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isMatchingToken({
  token,
  tokenHash,
}: {
  token: string;
  tokenHash: string;
}) {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getCancelUrl({ uid, token }: { uid: string; token: string }) {
  return `${env.NEXT_PUBLIC_BASE_URL}/book/cancel/${uid}?token=${encodeURIComponent(
    token,
  )}`;
}
