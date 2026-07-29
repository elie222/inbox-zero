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
  verifyConnectedCalendars = false,
  logger,
}: {
  emailAccountId: string;
  timeMin: Date;
  timeMax: Date;
  maxResultsPerProvider: number;
  verifyConnectedCalendars?: boolean;
  logger: Logger;
}): Promise<CalendarEventsInWindow> {
  const providers = await createCalendarEventProviders(emailAccountId, logger);
  // Zero providers never proves an empty calendar: connections are silently
  // skipped when their refresh token is gone or construction fails, and a sync
  // error may already have flipped them disconnected. Reporting complete here
  // would let callers treat every booked meeting as deleted.
  if (providers.length === 0) {
    return { events: [], complete: !verifyConnectedCalendars };
  }

  const connectedCalendars = verifyConnectedCalendars
    ? await prisma.calendarConnection.count({
        where: { emailAccountId, isConnected: true },
      })
    : providers.length;

  const results = await Promise.allSettled(
    providers.map((provider) =>
      provider.fetchEvents({
        timeMin,
        timeMax,
        maxResults: maxResultsPerProvider,
      }),
    ),
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

  return {
    events: filteredEvents,
    // A connection that never became a provider is as much a blind spot as a
    // provider that errored, so any shortfall against the connected calendars
    // marks the fetch incomplete.
    complete:
      failedProviders === 0 &&
      !truncated &&
      providers.length >= connectedCalendars,
  };
}

// Some clients keep a cancelled event on the calendar with a renamed title
// instead of deleting it.
function isCancelledEventTitle(title: string): boolean {
  return /^\s*(?:cancelled|canceled)(?:\s+event)?\s*:/i.test(title);
}
