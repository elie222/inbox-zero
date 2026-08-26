import type { calendar_v3 } from "@googleapis/calendar";
import type { Logger } from "@/utils/logger";
import { getCalendarClientWithRefresh } from "../client";
import type {
  CalendarAvailabilityProvider,
  BusyPeriod,
} from "../availability-types";
import {
  CalendarAvailabilityError,
  getCalendarAvailabilityErrorLogContext,
} from "../availability-error";

async function fetchGoogleCalendarBusyPeriods({
  calendarClient,
  calendarIds,
  timeMin,
  timeMax,
  logger,
  failOnCalendarError,
}: {
  calendarClient: calendar_v3.Calendar;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
  logger: Logger;
  failOnCalendarError?: boolean;
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
        if (calendar.errors?.length) {
          const availabilityError = new CalendarAvailabilityError({
            provider: "google",
            calendarErrors: [
              { calendarId: _calendarId, errors: calendar.errors },
            ],
          });
          const logContext =
            getCalendarAvailabilityErrorLogContext(availabilityError);
          const calendarIsMissing = isMissingCalendar(calendar.errors);

          if (calendarIsMissing) {
            logger.warn("Skipping unavailable Google calendar", logContext);
          } else {
            logger.error("Google Calendar returned availability errors", {
              ...logContext,
            });
          }

          if (failOnCalendarError && !calendarIsMissing) {
            throw availabilityError;
          }
          continue;
        }

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
    logger.error("Error fetching Google Calendar busy periods", {
      error,
      ...getCalendarAvailabilityErrorLogContext(error),
    });
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
      connectionId,
      refreshToken,
      expiresAt,
      emailAccountId,
      calendarIds,
      timeMin,
      timeMax,
      failOnCalendarError,
    }) {
      const calendarClient = await getCalendarClientWithRefresh({
        accessToken,
        refreshToken,
        expiresAt,
        emailAccountId,
        connectionId,
        logger,
      });

      return await fetchGoogleCalendarBusyPeriods({
        calendarClient,
        calendarIds,
        timeMin,
        timeMax,
        logger,
        failOnCalendarError,
      });
    },
  };
}

function isMissingCalendar(errors: calendar_v3.Schema$Error[]) {
  return errors.every((error) => error.reason === "notFound");
}
