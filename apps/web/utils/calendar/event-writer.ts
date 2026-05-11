import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { GoogleCalendarEventProvider } from "@/utils/calendar/providers/google-events";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";
import type { BookingLinkLocationType } from "@/generated/prisma/enums";
import type {
  CalendarEventAttendee,
  CalendarEventWriteResult,
} from "@/utils/calendar/event-types";

export type CreateCalendarEventInput = {
  attendees: CalendarEventAttendee[];
  description?: string;
  destinationCalendarId?: string | null;
  emailAccountId: string;
  endTime: Date;
  locationType: BookingLinkLocationType;
  locationValue?: string | null;
  startTime: Date;
  timezone: string;
  title: string;
};

export type CreatedCalendarEvent = CalendarEventWriteResult & {
  provider: string;
  providerConnectionId: string;
};

export async function createCalendarEvent({
  emailAccountId,
  destinationCalendarId,
  title,
  description,
  startTime,
  endTime,
  timezone,
  attendees,
  locationType,
  locationValue,
  logger,
}: CreateCalendarEventInput & {
  logger: Logger;
}): Promise<CreatedCalendarEvent> {
  const destination = await getWritableCalendar({
    emailAccountId,
    destinationCalendarId,
  });
  const provider = createWritableProvider({
    connection: destination.connection,
    emailAccountId,
    logger,
  });

  const createdEvent = await provider.createEvent({
    calendarId: destination.calendarId,
    title,
    description,
    startTime,
    endTime,
    timezone,
    attendees,
    locationType,
    locationValue,
  });

  return {
    ...createdEvent,
    provider: destination.connection.provider,
    providerConnectionId: destination.connection.id,
  };
}

export async function cancelCalendarEvent({
  providerConnectionId,
  providerCalendarId,
  providerEventId,
  emailAccountId,
  logger,
}: {
  providerConnectionId: string;
  providerCalendarId: string;
  providerEventId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  // Look up by connection id (unique) instead of (emailAccountId, provider)
  // — a host can have multiple connections of the same provider, and
  // calendarIds like "primary" recur across them.
  const connection = await prisma.calendarConnection.findFirst({
    where: { id: providerConnectionId, emailAccountId, isConnected: true },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      calendars: {
        where: { calendarId: providerCalendarId },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!connection) {
    throw new SafeError("Calendar connection not found");
  }
  if (connection.calendars.length === 0) {
    throw new SafeError("Destination calendar not found");
  }

  const writableProvider = createWritableProvider({
    connection,
    emailAccountId,
    logger,
  });

  await writableProvider.cancelEvent({
    calendarId: providerCalendarId,
    eventId: providerEventId,
  });
}

async function getWritableCalendar({
  emailAccountId,
  destinationCalendarId,
}: {
  emailAccountId: string;
  destinationCalendarId?: string | null;
}) {
  const where = destinationCalendarId
    ? { id: destinationCalendarId }
    : { primary: true };
  // Availability scans only consider enabled calendars, so writing to a
  // disabled one would silently bypass conflict detection.
  const calendar = await prisma.calendar.findFirst({
    where: {
      ...where,
      isEnabled: true,
      connection: {
        emailAccountId,
        isConnected: true,
      },
    },
    orderBy: [{ primary: "desc" }, { createdAt: "asc" }],
    select: {
      calendarId: true,
      connection: {
        select: {
          id: true,
          provider: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!calendar) {
    throw new SafeError("Destination calendar not found");
  }

  return calendar;
}

function createWritableProvider({
  connection,
  emailAccountId,
  logger,
}: {
  connection: {
    accessToken: string | null;
    expiresAt: Date | null;
    id: string;
    provider: string;
    refreshToken: string | null;
  };
  emailAccountId: string;
  logger: Logger;
}) {
  const providerParams = {
    accessToken: connection.accessToken,
    connectionId: connection.id,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt?.getTime() ?? null,
    emailAccountId,
  };

  if (isGoogleProvider(connection.provider)) {
    return new GoogleCalendarEventProvider(providerParams, logger);
  }

  if (isMicrosoftProvider(connection.provider)) {
    return new MicrosoftCalendarEventProvider(providerParams, logger);
  }

  throw new SafeError("Unsupported calendar provider");
}
