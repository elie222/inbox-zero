import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { extractDomainFromEmail } from "@/utils/email";

const MAX_EVENTS_PER_PROVIDER = 20;

export async function fetchUpcomingEvents({
  emailAccountId,
  minutesBefore,
}: {
  emailAccountId: string;
  minutesBefore: number;
}): Promise<CalendarEvent[]> {
  const providers = await createCalendarEventProviders(emailAccountId);
  if (providers.length === 0) {
    return [];
  }

  const timeMin = new Date();
  const timeMax = new Date(timeMin.getTime() + minutesBefore * 60 * 1000);

  const providerEvents = await Promise.all(
    providers.map((provider) =>
      provider.fetchEvents({
        timeMin,
        timeMax,
        maxResults: MAX_EVENTS_PER_PROVIDER,
      }),
    ),
  );

  return providerEvents
    .flat()
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
