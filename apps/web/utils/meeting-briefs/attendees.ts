import type {
  CalendarEvent,
  CalendarEventAttendee,
} from "@/utils/calendar/event-types";
import { extractDomainFromEmail, isPublicEmailDomain } from "@/utils/email";

interface PartitionedAttendees {
  external: CalendarEventAttendee[];
  internal: CalendarEventAttendee[];
}

// Personal-email accounts (gmail, outlook, etc.) share their domain with strangers,
// so we cannot treat same-domain attendees as an internal team.
export function partitionAttendeesForBriefing(
  event: CalendarEvent,
  userEmail: string,
): PartitionedAttendees {
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  const userDomain = extractDomainFromEmail(normalizedUserEmail).toLowerCase();
  const userDomainIsPublic = !userDomain || isPublicEmailDomain(userDomain);

  const external: CalendarEventAttendee[] = [];
  const internal: CalendarEventAttendee[] = [];

  for (const attendee of event.attendees) {
    const attendeeEmail = attendee.email.trim().toLowerCase();
    if (!attendeeEmail || attendeeEmail === normalizedUserEmail) continue;

    const attendeeDomain = extractDomainFromEmail(attendeeEmail).toLowerCase();
    if (!attendeeDomain) continue;

    if (userDomainIsPublic || attendeeDomain !== userDomain) {
      external.push(attendee);
    } else {
      internal.push(attendee);
    }
  }

  return { external, internal };
}
