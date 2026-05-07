import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { GoogleCalendarEventProvider } from "@/utils/calendar/providers/google-events";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";
import type {
  CalendarEventAttendee,
  CalendarEventLocationType,
  CalendarEventWriteResult,
} from "@/utils/calendar/event-types";

export type CreateCalendarEventInput = {
  attendees: CalendarEventAttendee[];
  description?: string;
  destinationCalendarId?: string | null;
  emailAccountId: string;
  endTime: Date;
  locationType: CalendarEventLocationType;
  locationValue?: string | null;
  startTime: Date;
  timezone: string;
  title: string;
};

export type CreatedCalendarEvent = CalendarEventWriteResult & {
  provider: string;
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
  };
}

export async function cancelCalendarEvent({
  emailAccountId,
  provider,
  providerCalendarId,
  providerEventId,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  providerCalendarId: string;
  providerEventId: string;
  logger: Logger;
}) {
  const destination = await prisma.calendar.findFirst({
    where: {
      calendarId: providerCalendarId,
      connection: {
        emailAccountId,
        isConnected: true,
        provider,
      },
    },
    select: {
      calendarId: true,
      connection: {
        select: {
          provider: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!destination) {
    throw new SafeError("Calendar connection not found");
  }

  const writableProvider = createWritableProvider({
    connection: destination.connection,
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
  const calendar = await prisma.calendar.findFirst({
    where: {
      ...where,
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
    provider: string;
    refreshToken: string | null;
  };
  emailAccountId: string;
  logger: Logger;
}) {
  const providerParams = {
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt?.getTime() ?? null,
    emailAccountId,
  };

  if (isGoogleProvider(connection.provider)) {
    return new GoogleCalendarEventProvider(providerParams, logger);
  }

  if (connection.provider === "microsoft") {
    return new MicrosoftCalendarEventProvider(providerParams, logger);
  }

  throw new SafeError("Unsupported calendar provider");
}
