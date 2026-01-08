import type { Client } from "@microsoft/microsoft-graph-client";
import type { Logger } from "@/utils/logger";
import { getCalendarClientWithRefresh } from "@/utils/outlook/calendar-client";
import type {
  CalendarAvailabilityProvider,
  BusyPeriod,
} from "../availability-types";

async function fetchMicrosoftCalendarBusyPeriods({
  calendarClient,
  calendarIds,
  timeMin,
  timeMax,
  logger,
}: {
  calendarClient: Client;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
  logger: Logger;
}): Promise<BusyPeriod[]> {
  try {
    const allBusyPeriods: BusyPeriod[] = [];

    for (const calendarId of calendarIds) {
      try {
        const startDateTime = new Date(timeMin).toISOString();
        const endDateTime = new Date(timeMax).toISOString();

        // Fetch all pages of events by following @odata.nextLink
        let nextLink: string | undefined;
        let isFirstPage = true;

        do {
          const response = isFirstPage
            ? await calendarClient
                .api(`/me/calendars/${calendarId}/calendarView`)
                .query({ startDateTime, endDateTime })
                .select("subject,start,end,showAs,isAllDay")
                // Request events in UTC to avoid Windows timezone name conversion issues
                .header("Prefer", 'outlook.timezone="UTC"')
                .get()
            : await calendarClient.api(nextLink!).get();

          isFirstPage = false;

          if (response.value) {
            for (const event of response.value) {
              if (
                event.showAs !== "free" &&
                event.start?.dateTime &&
                event.end?.dateTime
              ) {
                // With Prefer: outlook.timezone="UTC", dateTime is in UTC but without the Z suffix
                // We need to add it for proper ISO 8601 format
                const startDatetime = event.start.dateTime.endsWith("Z")
                  ? event.start.dateTime
                  : `${event.start.dateTime}Z`;
                const endDatetime = event.end.dateTime.endsWith("Z")
                  ? event.end.dateTime
                  : `${event.end.dateTime}Z`;

                allBusyPeriods.push({
                  start: startDatetime,
                  end: endDatetime,
                });
              }
            }
          }

          // Check for next page
          nextLink = response["@odata.nextLink"];
        } while (nextLink);
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

export function createMicrosoftAvailabilityProvider(
  logger: Logger,
): CalendarAvailabilityProvider {
  return {
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
        logger,
      });

      return await fetchMicrosoftCalendarBusyPeriods({
        calendarClient,
        calendarIds,
        timeMin,
        timeMax,
        logger,
      });
    },
  };
}
