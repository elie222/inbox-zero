import { addMinutes } from "date-fns/addMinutes";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { extractDomainFromEmail } from "@/utils/email";
import type { Logger } from "@/utils/logger";

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

  return results
    .filter(
      (result): result is PromiseFulfilledResult<CalendarEvent[]> =>
        result.status === "fulfilled",
    )
    .flatMap((result) => result.value)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export function filterEventsWithExternalGuests(
  events: CalendarEvent[],
  userEmail: string,
): CalendarEvent[] {
  const userDomain = extractDomainFromEmail(userEmail).toLowerCase();
  const normalizedUserEmail = userEmail.toLowerCase();

  return events.filter((event) =>
    event.attendees.some((attendee) => {
      const attendeeEmail = attendee.email.toLowerCase();
      if (attendeeEmail === normalizedUserEmail) {
        return false;
      }
      const attendeeDomain = extractDomainFromEmail(
        attendee.email,
      ).toLowerCase();
      return attendeeDomain !== userDomain;
    }),
  );
}
