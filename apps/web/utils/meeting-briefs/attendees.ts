import type {
  CalendarEvent,
  CalendarEventAttendee,
} from "@/utils/calendar/event-types";
import { extractDomainFromEmail, isSameOrganization } from "@/utils/email";

interface PartitionedAttendees {
  external: CalendarEventAttendee[];
  internal: CalendarEventAttendee[];
}

export function partitionAttendeesForBriefing(
  event: CalendarEvent,
  userEmail: string,
): PartitionedAttendees {
  const normalizedUserEmail = userEmail.trim().toLowerCase();

  const external: CalendarEventAttendee[] = [];
  const internal: CalendarEventAttendee[] = [];

  for (const attendee of event.attendees) {
    // A guest who declined isn't coming, so there's nobody to brief on.
    if (attendee.declined) continue;
    const attendeeEmail = attendee.email.trim().toLowerCase();
    if (!attendeeEmail || attendeeEmail === normalizedUserEmail) continue;
    if (!extractDomainFromEmail(attendeeEmail)) continue;

    if (isSameOrganization(attendeeEmail, normalizedUserEmail)) {
      internal.push(attendee);
    } else {
      external.push(attendee);
    }
  }

  return { external, internal };
}

export function hasUserDeclined(event: CalendarEvent, userEmail: string) {
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  return event.attendees.some(
    (attendee) =>
      attendee.declined &&
      attendee.email.trim().toLowerCase() === normalizedUserEmail,
  );
}
