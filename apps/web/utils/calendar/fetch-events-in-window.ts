import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";

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
}): Promise<CalendarEvent[]> {
  const providers = await createCalendarEventProviders(emailAccountId, logger);
  if (providers.length === 0) return [];

  const results = await Promise.allSettled(
    providers.map((provider) =>
      provider.fetchEvents({
        timeMin,
        timeMax,
        maxResults: maxResultsPerProvider,
      }),
    ),
  );

  const events = results
    .filter(
      (result): result is PromiseFulfilledResult<CalendarEvent[]> =>
        result.status === "fulfilled",
    )
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

  return filteredEvents;
}

// Some clients keep a cancelled event on the calendar with a renamed title
// instead of deleting it.
function isCancelledEventTitle(title: string): boolean {
  return /^\s*(?:cancelled|canceled)(?:\s+event)?\s*:/i.test(title);
}
