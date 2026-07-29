import { z } from "zod";
import type { CalendarEventAttendee } from "@/utils/calendar/event-types";

// Attendees are snapshotted onto the Meeting row because the calendar event may
// be edited or deleted before we finish processing the recording.
const meetingAttendeeSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  declined: z.boolean().optional(),
});

const meetingAttendeesSchema = z.array(meetingAttendeeSchema);

export type MeetingAttendee = z.infer<typeof meetingAttendeeSchema>;

export function toAttendeeSnapshot(
  attendees: CalendarEventAttendee[],
  organizerEmail?: string,
): MeetingAttendee[] {
  const snapshot = attendees.map((attendee) => ({
    email: attendee.email,
    ...(attendee.name ? { name: attendee.name } : {}),
    ...(attendee.declined ? { declined: true } : {}),
  }));

  const normalizedOrganizerEmail = organizerEmail?.trim().toLowerCase();
  if (
    normalizedOrganizerEmail &&
    !snapshot.some(
      (attendee) =>
        attendee.email.trim().toLowerCase() === normalizedOrganizerEmail,
    )
  ) {
    snapshot.push({ email: organizerEmail.trim() });
  }

  return snapshot;
}

export function parseAttendeeSnapshot(value: unknown): MeetingAttendee[] {
  const parsed = meetingAttendeesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Everyone worth addressing a follow-up to: not the user, and not declined. */
export function getFollowUpRecipients(
  attendees: MeetingAttendee[],
  userEmail: string,
): MeetingAttendee[] {
  const normalizedUserEmail = userEmail.trim().toLowerCase();

  return attendees.filter((attendee) => {
    const email = attendee.email.trim().toLowerCase();
    return !!email && email !== normalizedUserEmail && !attendee.declined;
  });
}
