import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { addMinutes } from "date-fns";
import {
  generateBookableSlots,
  validateSelectedSlot,
  type AvailabilityRule,
  type BusyPeriod,
} from "@inboxzero/scheduling";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import { getCalendarAvailabilityErrorLogContext } from "@/utils/calendar/availability-error";
import {
  cancelCalendarEvent,
  createCalendarEvent,
  type CreatedCalendarEvent,
} from "@/utils/calendar/event-writer";
import { BookingStatus } from "@/generated/prisma/enums";
import type { PublicBookingBody } from "@/utils/actions/booking.validation";
import {
  sendBookingCancellationEmails,
  sendBookingConfirmationEmails,
} from "@/utils/booking/emails";

const MAX_AVAILABILITY_RANGE_MS = 32 * 24 * 60 * 60 * 1000;
const PENDING_BOOKING_TIMEOUT_MS = 15 * 60 * 1000;
const CALENDAR_AVAILABILITY_UNAVAILABLE =
  "Calendar availability is temporarily unavailable";
const INVALID_CANCELLATION_LINK_MESSAGE = "Invalid cancellation link";
const BOOKING_CANCELED_RETRY_MESSAGE =
  "Booking was canceled. Please submit a new booking request.";
const BOOKING_STILL_PROCESSING_MESSAGE =
  "Booking request is still being processed";

export async function getPublicBookingLinkMetadata(slug: string) {
  const link = await prisma.bookingLink.findFirst({
    where: { slug, isActive: true },
    select: {
      slug: true,
      title: true,
      description: true,
      durationMinutes: true,
      slotIntervalMinutes: true,
      locationType: true,
      emailAccount: {
        select: { name: true },
      },
    },
  });

  if (!link) throw new SafeError("Booking link not found", 404);

  return {
    slug: link.slug,
    title: link.title,
    description: link.description,
    durationMinutes: link.durationMinutes,
    slotIntervalMinutes: link.slotIntervalMinutes,
    locationType: link.locationType,
    locationValue: null,
    hostName: link.emailAccount.name ?? null,
  };
}

export async function getPublicAvailability({
  slug,
  start,
  end,
  now = new Date(),
  logger,
}: {
  slug: string;
  start: Date;
  end: Date;
  now?: Date;
  logger: Logger;
}) {
  assertAvailabilityRange(start, end);

  const config = await loadPublicBookingLink(slug);
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
    timezone: config.link.timezone,
    start,
    end,
    rules: config.windows,
    busyPeriods,
    policy: getPolicy(config.link),
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

  const config = await loadPublicBookingLink(input.slug);
  const selectedEndTime = addMinutes(
    selectedStartTime,
    config.link.durationMinutes,
  );

  const existingBooking = await findIdempotentBooking({
    bookingLinkId: config.link.id,
    idempotencyToken: input.idempotencyToken,
  });
  if (existingBooking) {
    const result = await resolveExistingIdempotentBooking(existingBooking);
    if (result) return result;
  }

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
    timezone: config.link.timezone,
    start: selectedStartTime,
    end: selectedEndTime,
    selectedStartTime,
    rules: config.windows,
    busyPeriods,
    policy: getPolicy(config.link),
  });

  if (!slotValidation.valid) {
    throw new SafeError(slotValidation.reason);
  }

  const cancelToken = randomToken();
  let pendingBooking: Awaited<ReturnType<typeof createPendingBooking>>;

  try {
    pendingBooking = await createPendingBooking({
      config,
      input,
      selectedStartTime,
      selectedEndTime,
      cancelToken,
    });
  } catch (error) {
    if (isSlotConflictError(error)) {
      const existing = await findIdempotentBooking({
        bookingLinkId: config.link.id,
        idempotencyToken: input.idempotencyToken,
      });
      const resolved = await resolveExistingIdempotentBooking(existing);
      if (resolved) return resolved;
      throw new SafeError("Selected slot is no longer available");
    }
    throw error;
  }

  let createdEvent: CreatedCalendarEvent | null = null;
  let confirmedBooking = pendingBooking;

  try {
    createdEvent = await createCalendarEvent({
      emailAccountId: config.link.emailAccountId,
      destinationCalendarId: config.link.destinationCalendarId,
      title: config.link.title,
      description: getProviderEventDescription({
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestNote: input.guestNote,
      }),
      startTime: selectedStartTime,
      endTime: selectedEndTime,
      timezone: config.link.timezone,
      attendees: [{ name: input.guestName, email: input.guestEmail }],
      locationType: config.link.locationType,
      locationValue: config.link.locationValue,
      logger,
    });

    confirmedBooking = await prisma.booking.update({
      where: { id: pendingBooking.id },
      data: {
        provider: createdEvent.provider,
        providerConnectionId: createdEvent.providerConnectionId,
        providerCalendarId: createdEvent.providerCalendarId,
        providerEventId: createdEvent.id,
        videoConferenceLink: createdEvent.videoConferenceLink ?? null,
        status: BookingStatus.CONFIRMED,
      },
      include: getBookingHostInclude(),
    });
  } catch (error) {
    const providerEventToCleanup = createdEvent;
    await Promise.allSettled([
      providerEventToCleanup
        ? cancelCalendarEvent({
            emailAccountId: config.link.emailAccountId,
            providerConnectionId: providerEventToCleanup.providerConnectionId,
            providerCalendarId: providerEventToCleanup.providerCalendarId,
            providerEventId: providerEventToCleanup.id,
            logger,
          }).catch((cleanupError) => {
            logger.error(
              "Failed to clean up provider event after booking error",
              {
                bookingId: pendingBooking.id,
                provider: providerEventToCleanup.provider,
                providerCalendarId: providerEventToCleanup.providerCalendarId,
                providerEventId: providerEventToCleanup.id,
                error: cleanupError,
              },
            );
          })
        : Promise.resolve(),
      // Status FAILED removes the booking from the partial EXCLUDE constraint,
      // freeing the slot for re-booking.
      prisma.booking.update({
        where: { id: pendingBooking.id },
        data: { status: BookingStatus.FAILED },
      }),
    ]);
    logger.error("Failed to create provider event for booking", {
      bookingId: pendingBooking.id,
      error,
    });
    throw new SafeError("Failed to create calendar event");
  }

  await sendBookingConfirmationEmails({
    booking: confirmedBooking,
    guestTimezone: input.timezone,
    cancelUrl: getCancelUrl({ id: confirmedBooking.id, token: cancelToken }),
    logger,
  });

  return {
    ...toPublicBookingResult(confirmedBooking),
    cancelUrl: getCancelUrl({ id: confirmedBooking.id, token: cancelToken }),
  };
}

export async function cancelPublicBooking({
  id,
  token,
  reason,
  logger,
}: {
  id: string;
  token: string;
  reason?: string;
  logger: Logger;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: getBookingHostInclude(),
  });

  if (!booking) throw new SafeError(INVALID_CANCELLATION_LINK_MESSAGE, 404);
  if (!isMatchingToken({ token, tokenHash: booking.cancelTokenHash })) {
    throw new SafeError(INVALID_CANCELLATION_LINK_MESSAGE, 404);
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

  // Atomic CONFIRMED -> CANCELED transition so concurrent cancel requests
  // don't both trigger provider cancellation and duplicate host emails.
  const transition = await prisma.booking.updateMany({
    where: { id: booking.id, status: BookingStatus.CONFIRMED },
    data: {
      status: BookingStatus.CANCELED,
      cancellationReason: reason || null,
    },
  });
  if (transition.count === 0) {
    throw new SafeError("Booking is already canceled");
  }

  if (
    booking.providerConnectionId &&
    booking.providerCalendarId &&
    booking.providerEventId
  ) {
    // Provider cleanup is best-effort: if the host disconnected their
    // calendar, deleted the event manually, or the provider is unreachable,
    // we still mark the booking canceled locally so the guest isn't stuck
    // with a confirmed booking they can't cancel.
    try {
      await cancelCalendarEvent({
        emailAccountId: booking.emailAccountId,
        providerConnectionId: booking.providerConnectionId,
        providerCalendarId: booking.providerCalendarId,
        providerEventId: booking.providerEventId,
        logger,
      });
    } catch (error) {
      logger.error("Failed to cancel provider event during booking cancel", {
        bookingId: booking.id,
        error,
      });
    }
  }

  const canceledBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: getBookingHostInclude(),
  });

  await sendBookingCancellationEmails({
    booking: canceledBooking,
    logger,
  });

  return toPublicBookingResult(canceledBooking);
}

function getBookingHostInclude() {
  return {
    bookingLink: {
      select: {
        title: true,
        locationType: true,
        locationValue: true,
        timezone: true,
        emailAccount: {
          select: { email: true, name: true },
        },
      },
    },
  } as const;
}

async function loadPublicBookingLink(slug: string) {
  const link = await prisma.bookingLink.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      slotIntervalMinutes: true,
      locationType: true,
      locationValue: true,
      minimumNoticeMinutes: true,
      maxDaysAhead: true,
      timezone: true,
      emailAccountId: true,
      destinationCalendarId: true,
      windows: {
        select: {
          weekday: true,
          startMinutes: true,
          endMinutes: true,
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
  });

  if (!link) throw new SafeError("Booking link not found", 404);

  const enabledCalendarIds = link.emailAccount.calendarConnections.flatMap(
    (connection) => connection.calendars.map((calendar) => calendar.id),
  );
  if (enabledCalendarIds.length === 0) {
    throw new SafeError("No enabled calendar is available for this host");
  }
  // Availability is generated for any enabled calendar, but the booking is
  // written to the link's destinationCalendarId. If that specific calendar is
  // disabled or disconnected, fail early so guests don't fill out the form
  // and then hit a generic "Destination calendar not found" at submit time.
  if (
    link.destinationCalendarId &&
    !enabledCalendarIds.includes(link.destinationCalendarId)
  ) {
    throw new SafeError("No enabled calendar is available for this host");
  }

  return {
    link,
    windows: link.windows.map((window) => ({
      weekday: window.weekday,
      startMinutes: window.startMinutes,
      endMinutes: window.endMinutes,
    })) satisfies AvailabilityRule[],
  };
}

async function getBusyPeriods({
  config,
  start,
  end,
  logger,
  providerFailureMode,
}: {
  config: Awaited<ReturnType<typeof loadPublicBookingLink>>;
  start: Date;
  end: Date;
  logger: Logger;
  providerFailureMode: "return-null" | "throw-safe-error";
}): Promise<BusyPeriod[] | null> {
  const [providerBusyPeriods, existingBookings] = await Promise.all([
    getUnifiedCalendarAvailability({
      emailAccountId: config.link.emailAccountId,
      startDate: start,
      endDate: end,
      timezone: config.link.timezone,
      logger,
      failClosed: true,
      excludeGoogleVirtualCalendars: true,
    }).catch((error) => {
      logger.error("Failed to load provider availability for public booking", {
        error,
        ...getCalendarAvailabilityErrorLogContext(error),
      });

      if (providerFailureMode === "return-null") return null;

      throw new SafeError(CALENDAR_AVAILABILITY_UNAVAILABLE);
    }),
    // In-flight bookings haven't propagated to the calendar yet but already
    // hold the slot via the partial EXCLUDE constraint, so surface them as busy.
    prisma.booking
      .findMany({
        where: {
          emailAccountId: config.link.emailAccountId,
          status: {
            in: [BookingStatus.PENDING_PROVIDER_EVENT, BookingStatus.CONFIRMED],
          },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: {
          startTime: true,
          endTime: true,
          status: true,
        },
      })
      .catch((error) => {
        logger.error("Failed to load existing bookings for public booking", {
          error,
        });

        if (providerFailureMode === "return-null") return null;

        throw new SafeError(CALENDAR_AVAILABILITY_UNAVAILABLE);
      }),
  ]);

  if (!providerBusyPeriods || !existingBookings) return null;

  return [
    ...providerBusyPeriods,
    ...existingBookings
      .filter((booking) => isBlockingBooking(booking))
      .map((booking) => ({
        start: booking.startTime,
        end: booking.endTime,
      })),
  ];
}

function getPolicy(link: {
  durationMinutes: number;
  slotIntervalMinutes: number;
  minimumNoticeMinutes: number;
  maxDaysAhead: number;
}) {
  return {
    durationMinutes: link.durationMinutes,
    slotIntervalMinutes: link.slotIntervalMinutes,
    minimumNoticeMinutes: link.minimumNoticeMinutes,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    bookingWindowDays: link.maxDaysAhead,
  };
}

function isSlotConflictError(error: unknown) {
  if (isDuplicateError(error)) return true;
  // Postgres exclusion-constraint violation (SQL state 23P01) is not surfaced
  // as P2002; Prisma includes the SQL state in the error message.
  return error instanceof Error && error.message.includes("23P01");
}

async function createPendingBooking({
  config,
  input,
  selectedStartTime,
  selectedEndTime,
  cancelToken,
}: {
  config: Awaited<ReturnType<typeof loadPublicBookingLink>>;
  input: PublicBookingBody;
  selectedStartTime: Date;
  selectedEndTime: Date;
  cancelToken: string;
}) {
  return prisma.booking.create({
    data: {
      bookingLinkId: config.link.id,
      emailAccountId: config.link.emailAccountId,
      guestName: input.guestName,
      guestEmail: input.guestEmail.toLowerCase(),
      guestNote: input.guestNote,
      startTime: selectedStartTime,
      endTime: selectedEndTime,
      status: BookingStatus.PENDING_PROVIDER_EVENT,
      cancelTokenHash: hashToken(cancelToken),
      idempotencyToken: input.idempotencyToken,
    },
    include: getBookingHostInclude(),
  });
}

async function findIdempotentBooking({
  bookingLinkId,
  idempotencyToken,
}: {
  bookingLinkId: string;
  idempotencyToken: string;
}) {
  return prisma.booking.findFirst({
    where: { bookingLinkId, idempotencyToken },
    include: getBookingHostInclude(),
  });
}

async function resolveExistingIdempotentBooking(
  booking: Awaited<ReturnType<typeof findIdempotentBooking>>,
) {
  if (!booking) return null;

  if (booking.status === BookingStatus.CONFIRMED) {
    return toPublicBookingResult(booking);
  }

  if (booking.status === BookingStatus.FAILED) {
    await prisma.booking.delete({ where: { id: booking.id } });
    return null;
  }

  if (
    booking.status === BookingStatus.PENDING_PROVIDER_EVENT &&
    isStalePendingBooking(booking)
  ) {
    await prisma.booking.delete({ where: { id: booking.id } });
    return null;
  }

  if (booking.status === BookingStatus.CANCELED) {
    throw new SafeError(BOOKING_CANCELED_RETRY_MESSAGE);
  }

  throw new SafeError(BOOKING_STILL_PROCESSING_MESSAGE);
}

function getProviderEventDescription({
  guestName,
  guestEmail,
  guestNote,
}: {
  guestName: string;
  guestEmail: string;
  guestNote?: string;
}) {
  return [
    `Booked with ${cleanCalendarDescriptionText(guestName)}`,
    `Guest email: ${cleanCalendarDescriptionText(guestEmail)}`,
    guestNote ? `Guest note: ${cleanCalendarDescriptionText(guestNote)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function cleanCalendarDescriptionText(value: string) {
  return value
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("");
}

function toPublicBookingResult(booking: {
  endTime: Date;
  id: string;
  startTime: Date;
  status: BookingStatus;
}) {
  return {
    id: booking.id,
    status: booking.status,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
  };
}

function isBlockingBooking(booking: { status: BookingStatus }) {
  return (
    booking.status === BookingStatus.CONFIRMED ||
    booking.status === BookingStatus.PENDING_PROVIDER_EVENT
  );
}

function isStalePendingBooking(booking: {
  createdAt: Date;
  status: BookingStatus;
}) {
  return (
    booking.status === BookingStatus.PENDING_PROVIDER_EVENT &&
    Date.now() - booking.createdAt.getTime() > PENDING_BOOKING_TIMEOUT_MS
  );
}

function assertAvailabilityRange(start: Date, end: Date) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new SafeError("Invalid date range");
  }
  if (end <= start) throw new SafeError("Invalid date range");
  if (end.getTime() - start.getTime() > MAX_AVAILABILITY_RANGE_MS) {
    throw new SafeError("Availability range must be 32 days or less");
  }
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

function getCancelUrl({ id, token }: { id: string; token: string }) {
  return `${env.NEXT_PUBLIC_BASE_URL}/book/cancel/${id}?token=${encodeURIComponent(
    token,
  )}`;
}
