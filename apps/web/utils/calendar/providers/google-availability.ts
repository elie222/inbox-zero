import type { calendar_v3 } from "@googleapis/calendar";
import { createScopedLogger } from "@/utils/logger";
import { getCalendarClientWithRefresh } from "../client";
import type {
  CalendarAvailabilityProvider,
  BusyPeriod,
} from "../availability-types";

const logger = createScopedLogger("calendar/google-availability");

async function fetchGoogleCalendarBusyPeriods({
  calendarClient,
  calendarIds,
  timeMin,
  timeMax,
}: {
  calendarClient: calendar_v3.Calendar;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
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

export const googleAvailabilityProvider: CalendarAvailabilityProvider = {
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
    });

    return await fetchGoogleCalendarBusyPeriods({
      calendarClient,
      calendarIds,
      timeMin,
      timeMax,
    });
  },
};
