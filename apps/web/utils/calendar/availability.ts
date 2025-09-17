import type { calendar_v3 } from "@googleapis/calendar";
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

    const busyPeriods: Array<{
      start: string;
      end: string;
      calendarId: string;
    }> = [];

    if (response.data.calendars) {
      for (const [calendarId, calendar] of Object.entries(
        response.data.calendars,
      )) {
        if (calendar.busy) {
          for (const period of calendar.busy) {
            if (period.start && period.end) {
              busyPeriods.push({
                start: period.start,
                end: period.end,
                calendarId,
              });
            }
          }
        }
      }
    }

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
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
  calendarIds: string[];
  startDate: Date;
  endDate: Date;
}): Promise<BusyPeriod[]> {
  const calendarClient = await getCalendarClientWithRefresh({
    accessToken,
    refreshToken,
    expiresAt,
    emailAccountId,
  });

  const timeMin = startOfDay(startDate).toISOString();
  const timeMax = endOfDay(endDate).toISOString();

  return await fetchCalendarBusyPeriods({
    calendarClient,
    calendarIds,
    timeMin,
    timeMax,
  });
}
