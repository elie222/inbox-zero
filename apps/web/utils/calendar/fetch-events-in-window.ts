import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export interface CalendarEventsInWindow {
  /**
   * False when a provider errored or hit the result cap, so the event list is
   * only part of what is really on the calendar. Callers that infer deletion
   * from absence must not act on an incomplete list.
   */
  complete: boolean;
  events: CalendarEvent[];
}

/**
 * Fetches events from every connected calendar in a time window, merged and
 * sorted by start time. A provider that fails is skipped rather than failing
 * the whole fetch, since most accounts have a single calendar and a partial
 * result still beats none.
 */
export async function fetchCalendarEventsInWindow({
  emailAccountId,
  timeMin,
  timeMax,
  maxResultsPerProvider,
  logger,
}: {
  emailAccountId: string;
  timeMin: Date;
  timeMax: Date;
  maxResultsPerProvider: number;
  logger: Logger;
}): Promise<CalendarEventsInWindow> {
  logger.info("Starting calendar event window fetch");
  const providers = await createCalendarEventProviders(emailAccountId, logger);
  logger.info("Created calendar event providers", {
    providerCount: providers.length,
  });
  // Zero providers never proves an empty calendar: connections are silently
  // skipped when their refresh token is gone or construction fails, and a sync
  // error may already have flipped them disconnected. Reporting complete here
  // would let callers treat every booked meeting as deleted.
  if (providers.length === 0) {
    logger.info("Completed calendar event window fetch", {
      complete: false,
      eventCount: 0,
      failedProviders: 0,
      providerCount: 0,
    });
    return { events: [], complete: false };
  }

  const connectedCalendars = await prisma.calendarConnection.count({
    where: { emailAccountId, isConnected: true },
  });
  logger.info("Counted connected calendars", { connectedCalendars });

  const results = await Promise.allSettled(
    providers.map(async (provider, providerIndex) => {
      const providerLogger = logger.with({
        calendarProviderIndex: providerIndex,
      });
      providerLogger.info("Starting calendar provider event fetch");

      try {
        const events = await provider.fetchEvents({
          timeMin,
          timeMax,
          maxResults: maxResultsPerProvider,
        });

        providerLogger.info("Completed calendar provider event fetch", {
          eventCount: events.length,
        });
        return events;
      } catch (error) {
        providerLogger.error("Failed calendar provider event fetch", {
          error,
        });
        throw error;
      }
    }),
  );

  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<CalendarEvent[]> =>
      result.status === "fulfilled",
  );

  const failedProviders = results.length - fulfilled.length;
  if (failedProviders > 0) {
    logger.warn("Calendar fetch returned partial results", {
      failedProviders,
      totalProviders: results.length,
    });
  }

  // A provider that filled the page may have more beyond it.
  const truncated = fulfilled.some(
    (result) => result.value.length >= maxResultsPerProvider,
  );

  const events = fulfilled
    .flatMap((result) => result.value)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const filteredEvents = events.filter(
    (event) => !isCancelledEventTitle(event.title),
  );
  const skippedCancelledEvents = events.length - filteredEvents.length;

  if (skippedCancelledEvents > 0) {
    logger.info("Skipping cancelled calendar events", {
      count: skippedCancelledEvents,
    });
  }

  // A connection that never became a provider is as much a blind spot as a
  // provider that errored, so any shortfall against the connected calendars
  // marks the fetch incomplete.
  const complete =
    failedProviders === 0 &&
    !truncated &&
    providers.length >= connectedCalendars;

  logger.info("Completed calendar event window fetch", {
    complete,
    eventCount: filteredEvents.length,
    failedProviders,
    providerCount: providers.length,
  });

  return { events: filteredEvents, complete };
}

// Some clients keep a cancelled event on the calendar with a renamed title
// instead of deleting it.
function isCancelledEventTitle(title: string): boolean {
  return /^\s*(?:cancelled|canceled)(?:\s+event)?\s*:/i.test(title);
}
