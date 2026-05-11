import {
  sendGuestBookingConfirmationEmail,
  sendHostBookingCancellationEmail,
  sendHostBookingConfirmationEmail,
} from "@inboxzero/resend";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { formatDateTimeInUserTimezone } from "@/utils/date";

type BookingEmailPayload = {
  cancellationReason?: string | null;
  endTime: Date;
  guestEmail: string;
  guestName: string;
  guestNote?: string | null;
  id: string;
  startTime: Date;
  videoConferenceLink?: string | null;
  bookingLink: {
    title: string;
    locationType: BookingLinkLocationType;
    locationValue: string | null;
    timezone: string;
    emailAccount: {
      email: string;
      name?: string | null;
    };
  };
};

export async function sendBookingConfirmationEmails({
  booking,
  guestTimezone,
  cancelUrl,
  logger,
}: {
  booking: BookingEmailPayload;
  guestTimezone: string;
  cancelUrl: string;
  logger: Logger;
}) {
  const link = booking.bookingLink;
  const host = link.emailAccount;
  const location = getLocationLabel(link);
  const guestParts = formatBookingParts({
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: guestTimezone,
  });
  const hostParts = formatBookingParts({
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: link.timezone,
  });

  try {
    await Promise.all([
      sendGuestBookingConfirmationEmail({
        from: env.RESEND_FROM_EMAIL,
        to: booking.guestEmail,
        emailProps: {
          cancelUrl,
          eventTitle: link.title,
          formattedTime: guestParts.formattedTime,
          guestName: booking.guestName,
          hostName: host.name ?? host.email,
          location,
          dateMonth: guestParts.dateMonth,
          dateDay: guestParts.dateDay,
          dateWeekday: guestParts.dateWeekday,
          timeRange: guestParts.timeRange,
          timezoneLabel: guestTimezone,
          guestNote: booking.guestNote ?? null,
          meetingLink: getMeetingLink(booking),
        },
      }),
      sendHostBookingConfirmationEmail({
        from: env.RESEND_FROM_EMAIL,
        to: host.email,
        emailProps: {
          eventTitle: link.title,
          formattedTime: hostParts.formattedTime,
          guestEmail: booking.guestEmail,
          guestName: booking.guestName,
          location,
          dateMonth: hostParts.dateMonth,
          dateDay: hostParts.dateDay,
          dateWeekday: hostParts.dateWeekday,
          timeRange: hostParts.timeRange,
          timezoneLabel: link.timezone,
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
  const link = booking.bookingLink;
  const host = link.emailAccount;

  try {
    await sendHostBookingCancellationEmail({
      from: env.RESEND_FROM_EMAIL,
      to: host.email,
      emailProps: {
        eventTitle: link.title,
        formattedTime: formatDateTimeInUserTimezone(
          booking.startTime,
          link.timezone,
        ),
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
        reason: booking.cancellationReason,
      },
    });
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

function getMeetingLink(booking: BookingEmailPayload) {
  // Prefer the link the calendar provider generated at event-creation time
  // (e.g. Google Meet, Teams) over the configured location value.
  if (booking.videoConferenceLink) return booking.videoConferenceLink;
  if (isUrl(booking.bookingLink.locationValue)) {
    return booking.bookingLink.locationValue;
  }
  return null;
}

function getLocationLabel(link: BookingEmailPayload["bookingLink"]) {
  if (link.locationType === BookingLinkLocationType.GOOGLE_MEET)
    return "Google Meet";
  if (link.locationType === BookingLinkLocationType.MICROSOFT_TEAMS)
    return "Microsoft Teams";
  return link.locationValue || null;
}
