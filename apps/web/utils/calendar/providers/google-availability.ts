import type { calendar_v3 } from "@googleapis/calendar";
import type { Logger } from "@/utils/logger";
import { getCalendarClientWithRefresh } from "../client";
import type {
  CalendarAvailabilityProvider,
  BusyPeriod,
} from "../availability-types";

async function fetchGoogleCalendarBusyPeriods({
  calendarClient,
  calendarIds,
  timeMin,
  timeMax,
  logger,
}: {
  calendarClient: calendar_v3.Calendar;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
  logger: Logger;
}): Promise<BusyPeriod[]> {
  try {
    const response = await calendarClient.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const busyPeriods: BusyPeriod[] = [];

    if (response.data.calendars) {
      for (const [_calendarId, calendar] of Object.entries(
        response.data.calendars,
      )) {
        if (calendar.busy) {
          for (const period of calendar.busy) {
            if (period.start && period.end) {
              busyPeriods.push({
                start: period.start,
                end: period.end,
              });
            }
          }
        }
      }
    }

    logger.trace("Google Calendar busy periods", {
      busyPeriods,
      timeMin,
      timeMax,
    });

    return busyPeriods;
  } catch (error) {
    logger.error("Error fetching Google Calendar busy periods", { error });
    throw error;
  }
}

export function createGoogleAvailabilityProvider(
  logger: Logger,
): CalendarAvailabilityProvider {
  return {
    name: "google",

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
        logger,
      });

      return await fetchGoogleCalendarBusyPeriods({
        calendarClient,
        calendarIds,
        timeMin,
        timeMax,
        logger,
      });
    },
  };
}
