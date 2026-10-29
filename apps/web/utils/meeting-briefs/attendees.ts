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

  for (const attendee of getBriefingAttendees(event)) {
    // A guest who declined isn't coming, so there's nobody to brief on.
    if (attendee.declined || attendee.self) continue;
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
  if (event.userDeclined) return true;
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  return event.attendees.some(
    (attendee) =>
      attendee.declined &&
      attendee.email.trim().toLowerCase() === normalizedUserEmail,
  );
}

// Outlook lists the organizer separately from attendees, so an outside
// organizer would otherwise never count as someone to brief on.
function getBriefingAttendees(event: CalendarEvent): CalendarEventAttendee[] {
  const organizerEmail = event.organizerEmail?.trim().toLowerCase();
  if (event.isOrganizer || !organizerEmail) return event.attendees;

  const organizerListed = event.attendees.some(
    (attendee) => attendee.email.trim().toLowerCase() === organizerEmail,
  );
  return organizerListed
    ? event.attendees
    : [...event.attendees, { email: organizerEmail }];
}
