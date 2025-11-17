import type { Client } from "@microsoft/microsoft-graph-client";
import { createScopedLogger } from "@/utils/logger";
import { getCalendarClientWithRefresh } from "@/utils/outlook/calendar-client";
import type {
  CalendarAvailabilityProvider,
  BusyPeriod,
} from "../availability-types";

const logger = createScopedLogger("calendar/microsoft-availability");

async function fetchMicrosoftCalendarBusyPeriods({
  calendarClient,
  calendarIds,
  timeMin,
  timeMax,
}: {
  calendarClient: Client;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
}): Promise<BusyPeriod[]> {
  try {
    const allBusyPeriods: BusyPeriod[] = [];

    for (const calendarId of calendarIds) {
      try {
        const startDateTime = new Date(timeMin).toISOString();
        const endDateTime = new Date(timeMax).toISOString();

        const response = await calendarClient
          .api(`/me/calendars/${calendarId}/calendarView`)
          .query({ startDateTime, endDateTime })
          .select("subject,start,end,showAs,isAllDay")
          .get();

        if (response.value) {
          for (const event of response.value) {
            if (
              event.showAs !== "free" &&
              event.start?.dateTime &&
              event.end?.dateTime
            ) {
              allBusyPeriods.push({
                start: event.start.dateTime,
                end: event.end.dateTime,
              });
            }
          }
        }
      } catch (calendarError) {
        logger.error("Error fetching calendar events", {
          calendarId,
          error: calendarError,
        });
      }
    }

    return allBusyPeriods;
  } catch (error) {
    logger.error("Error fetching Microsoft Calendar busy periods", { error });
    throw error;
  }
}

export const microsoftAvailabilityProvider: CalendarAvailabilityProvider = {
  name: "microsoft",

  async fetchBusyPeriods({
    accessToken,
    refreshToken,
    expiresAt,
    emailAccountId,
    calendarIds,
    timeMin,
    timeMax,
  }) {
    const calendarClient = await getCalendarClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt,
      emailAccountId,
    });

    return await fetchMicrosoftCalendarBusyPeriods({
      calendarClient,
      calendarIds,
      timeMin,
      timeMax,
    });
  },
};
