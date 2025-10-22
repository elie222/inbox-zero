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
    // Microsoft Graph API getSchedule endpoint
    const response = await calendarClient.api("/me/calendar/getSchedule").post({
      schedules: calendarIds,
      startTime: {
        dateTime: timeMin,
        timeZone: "UTC",
      },
      endTime: {
        dateTime: timeMax,
        timeZone: "UTC",
      },
    });

    const busyPeriods: BusyPeriod[] = [];

    if (response.value) {
      for (const schedule of response.value) {
        if (schedule.scheduleItems) {
          for (const item of schedule.scheduleItems) {
            // Microsoft returns various statuses: busy, tentative, oof, workingElsewhere
            // We consider all non-free items as busy
            if (item.status !== "free" && item.start && item.end) {
              busyPeriods.push({
                start: item.start.dateTime,
                end: item.end.dateTime,
              });
            }
          }
        }
      }
    }

    logger.trace("Microsoft Calendar busy periods", {
      busyPeriods,
      timeMin,
      timeMax,
    });

    return busyPeriods;
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
