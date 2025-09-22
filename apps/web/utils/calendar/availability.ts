import type { calendar_v3 } from "@googleapis/calendar";
import { fromZonedTime } from "date-fns-tz";
import { getCalendarClientWithRefresh } from "./client";
import { createScopedLogger } from "@/utils/logger";
import { startOfDay, endOfDay } from "date-fns";

const logger = createScopedLogger("calendar/availability");

export type BusyPeriod = {
  start: string;
  end: string;
};

async function fetchCalendarBusyPeriods({
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

    logger.trace("Calendar busy periods", { busyPeriods, timeMin, timeMax });

    return busyPeriods;
  } catch (error) {
    logger.error("Error fetching calendar busy periods", { error });
    throw error;
  }
}

export async function getCalendarAvailability({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
  calendarIds,
  startDate,
  endDate,
  timezone = "UTC",
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
  calendarIds: string[];
  startDate: Date;
  endDate: Date;
  timezone?: string;
}): Promise<BusyPeriod[]> {
  const calendarClient = await getCalendarClientWithRefresh({
    accessToken,
    refreshToken,
    expiresAt,
    emailAccountId,
  });

  // Convert dates to the user's timezone first, then to UTC for the API
  const startOfDayInTimezone = startOfDay(startDate);
  const endOfDayInTimezone = endOfDay(endDate);

  // Convert timezone-aware dates to UTC for Google Calendar API
  const timeMin = fromZonedTime(startOfDayInTimezone, timezone).toISOString();
  const timeMax = fromZonedTime(endOfDayInTimezone, timezone).toISOString();

  logger.trace("Calendar availability request with timezone", {
    timezone,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    timeMin,
    timeMax,
  });

  return await fetchCalendarBusyPeriods({
    calendarClient,
    calendarIds,
    timeMin,
    timeMax,
  });
}
