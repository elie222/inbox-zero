import { addMinutes } from "date-fns/addMinutes";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import { partitionAttendeesForBriefing } from "./attendees";

const MAX_EVENTS_PER_PROVIDER = 20;

export async function fetchUpcomingEvents({
  emailAccountId,
  minutesBefore,
  logger,
}: {
  emailAccountId: string;
  minutesBefore: number;
  logger: Logger;
}): Promise<CalendarEvent[]> {
  const providers = await createCalendarEventProviders(emailAccountId, logger);
  if (providers.length === 0) {
    return [];
  }

  const timeMin = new Date();
  const timeMax = addMinutes(timeMin, minutesBefore);

  const results = await Promise.allSettled(
    providers.map((provider) =>
      provider.fetchEvents({
        timeMin,
        timeMax,
        maxResults: MAX_EVENTS_PER_PROVIDER,
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

export function filterEventsWithExternalGuests(
  events: CalendarEvent[],
  userEmail: string,
): CalendarEvent[] {
  return events.filter(
    (event) =>
      partitionAttendeesForBriefing(event, userEmail).external.length > 0,
  );
}

function isCancelledEventTitle(title: string): boolean {
  return /^\s*(?:cancelled|canceled)(?:\s+event)?\s*:/i.test(title);
}
