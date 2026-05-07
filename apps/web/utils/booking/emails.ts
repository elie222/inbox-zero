import {
  sendGuestBookingCancellationEmail,
  sendGuestBookingConfirmationEmail,
  sendHostBookingCancellationEmail,
  sendHostBookingConfirmationEmail,
} from "@inboxzero/resend";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { BookingEventTypeLocationType } from "@/generated/prisma/enums";
import { formatDateTimeInUserTimezone } from "@/utils/date";

type BookingEmailPayload = {
  cancellationReason?: string | null;
  endTime: Date;
  eventTypeLocationType: BookingEventTypeLocationType;
  eventTypeLocationValue?: string | null;
  eventTypeTimezone: string;
  eventTypeTitle: string;
  guestEmail: string;
  guestName: string;
  guestNote?: string | null;
  id: string;
  startTime: Date;
  timezone: string;
  eventType: {
    hosts: Array<{
      emailAccount: {
        email: string;
        name?: string | null;
      };
    }>;
  };
};

export async function sendBookingConfirmationEmails({
  booking,
  cancelUrl,
  logger,
}: {
  booking: BookingEmailPayload;
  cancelUrl: string;
  logger: Logger;
}) {
  const host = getHost(booking);
  if (!host) {
    logger.warn("Skipping booking confirmation email without active host", {
      bookingId: booking.id,
    });
    return;
  }

  const location = getLocationLabel(booking);
  const guestParts = formatBookingParts({
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: booking.timezone,
  });
  const hostParts = formatBookingParts({
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: booking.eventTypeTimezone,
  });

  try {
    await Promise.all([
      sendGuestBookingConfirmationEmail({
        from: env.RESEND_FROM_EMAIL,
        to: booking.guestEmail,
        emailProps: {
          baseUrl: env.NEXT_PUBLIC_BASE_URL,
          cancelUrl,
          eventTitle: booking.eventTypeTitle,
          formattedTime: guestParts.formattedTime,
          guestName: booking.guestName,
          hostName: host.name || host.email,
          location,
          dateMonth: guestParts.dateMonth,
          dateDay: guestParts.dateDay,
          dateWeekday: guestParts.dateWeekday,
          timeRange: guestParts.timeRange,
          timezoneLabel: booking.timezone,
          guestNote: booking.guestNote ?? null,
          meetingLink:
            booking.eventTypeLocationType ===
              BookingEventTypeLocationType.GOOGLE_MEET ||
            isUrl(booking.eventTypeLocationValue)
              ? (booking.eventTypeLocationValue ?? null)
              : null,
        },
      }),
      sendHostBookingConfirmationEmail({
        from: env.RESEND_FROM_EMAIL,
        to: host.email,
        emailProps: {
          eventTitle: booking.eventTypeTitle,
          formattedTime: hostParts.formattedTime,
          guestEmail: booking.guestEmail,
          guestName: booking.guestName,
          location,
          dateMonth: hostParts.dateMonth,
          dateDay: hostParts.dateDay,
          dateWeekday: hostParts.dateWeekday,
          timeRange: hostParts.timeRange,
          timezoneLabel: booking.eventTypeTimezone,
          guestNote: booking.guestNote ?? null,
        },
      }),
    ]);
  } catch (error) {
    logger.error("Failed to send booking confirmation emails", {
      bookingId: booking.id,
      error,
    });
  }
}

export async function sendBookingCancellationEmails({
  booking,
  logger,
}: {
  booking: BookingEmailPayload;
  logger: Logger;
}) {
  const host = getHost(booking);
  if (!host) {
    logger.warn("Skipping booking cancellation email without active host", {
      bookingId: booking.id,
    });
    return;
  }

  try {
    await Promise.all([
      sendGuestBookingCancellationEmail({
        from: env.RESEND_FROM_EMAIL,
        to: booking.guestEmail,
        emailProps: {
          eventTitle: booking.eventTypeTitle,
          formattedTime: formatDateTimeInUserTimezone(
            booking.startTime,
            booking.timezone,
          ),
          guestName: booking.guestName,
          hostName: host.name || host.email,
          reason: booking.cancellationReason,
        },
      }),
      sendHostBookingCancellationEmail({
        from: env.RESEND_FROM_EMAIL,
        to: host.email,
        emailProps: {
          eventTitle: booking.eventTypeTitle,
          formattedTime: formatDateTimeInUserTimezone(
            booking.startTime,
            booking.eventTypeTimezone,
          ),
          guestEmail: booking.guestEmail,
          guestName: booking.guestName,
          reason: booking.cancellationReason,
        },
      }),
    ]);
  } catch (error) {
    logger.error("Failed to send booking cancellation emails", {
      bookingId: booking.id,
      error,
    });
  }
}

function formatBookingParts({
  startTime,
  endTime,
  timezone,
}: {
  startTime: Date;
  endTime: Date;
  timezone: string;
}) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).formatToParts(startTime);
  const dateMonth = (
    dateParts.find((part) => part.type === "month")?.value ?? ""
  ).toUpperCase();
  const dateDay = dateParts.find((part) => part.type === "day")?.value ?? "";
  const dateWeekday =
    dateParts.find((part) => part.type === "weekday")?.value ?? "";

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
  const timeRange = `${timeFormatter.format(startTime)} – ${timeFormatter.format(endTime)}`;

  return {
    formattedTime: formatDateTimeInUserTimezone(startTime, timezone),
    dateMonth,
    dateDay,
    dateWeekday,
    timeRange,
  };
}

function isUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getHost(booking: BookingEmailPayload) {
  return booking.eventType.hosts[0]?.emailAccount ?? null;
}

function getLocationLabel(booking: BookingEmailPayload) {
  if (
    booking.eventTypeLocationType === BookingEventTypeLocationType.GOOGLE_MEET
  )
    return "Google Meet";
  return booking.eventTypeLocationValue || null;
}
