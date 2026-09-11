import { addMinutes } from "date-fns/addMinutes";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { fetchCalendarEventsInWindow } from "@/utils/calendar/fetch-events-in-window";
import type { Logger } from "@/utils/logger";
import { partitionAttendeesForBriefing } from "./attendees";

const MAX_EVENTS_PER_PROVIDER = 20;

// Must match the /api/meeting-briefs cron schedule in vercel.json.
// The lookahead window extends by one cron interval so an event whose lead
// window opens and closes between two cron ticks is still picked up at the
// last tick before it starts. Duplicate sends are prevented by the
// meetingBriefing unique-constraint claim in process.ts.
const CRON_INTERVAL_MINUTES = 15;

export async function fetchUpcomingEvents({
  emailAccountId,
  minutesBefore,
  logger,
}: {
  emailAccountId: string;
  minutesBefore: number;
  logger: Logger;
}): Promise<CalendarEvent[]> {
  const timeMin = new Date();

  // Briefings only ever act on the events they can see, so a partial fetch is
  // harmless here.
  const { events } = await fetchCalendarEventsInWindow({
    emailAccountId,
    timeMin,
    timeMax: addMinutes(timeMin, minutesBefore + CRON_INTERVAL_MINUTES),
    maxResultsPerProvider: MAX_EVENTS_PER_PROVIDER,
    logger,
  });

  return events;
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
