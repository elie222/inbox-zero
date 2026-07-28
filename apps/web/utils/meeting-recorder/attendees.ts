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
): MeetingAttendee[] {
  return attendees.map((attendee) => ({
    email: attendee.email,
    ...(attendee.name ? { name: attendee.name } : {}),
    ...(attendee.declined ? { declined: true } : {}),
  }));
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
