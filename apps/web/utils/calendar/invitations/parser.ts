import { CALENDAR_INVITATION_LIMITS } from "@/utils/calendar/invitations/constants";
import ICAL from "ical.js";
import { z } from "zod";

export type InvitationEvent = { id: string; response: string | null };

export type InvitationResponse = "accepted" | "declined" | "tentative";
export type CalendarInvitation = NonNullable<
  ReturnType<typeof parseCalendarInvitation>
>;

export function parseCalendarInvitation(content: string, email: string) {
  if (content.length > CALENDAR_INVITATION_LIMITS.content) return null;
  try {
    const identity = getCalendarInvitationIdentity(content);
    if (identity?.method !== "REQUEST") return null;
    const { event, uid, organizer, sequence, recurrenceId } = identity;
    if (event.getFirstPropertyValue("status") === "CANCELLED") return null;
    const attendee = event
      .getAllProperties("attendee")
      .find(
        (property) =>
          getEmail(property.getFirstValue()) === email.toLowerCase(),
      );
    const start = event.getFirstPropertyValue("dtstart");
    if (
      !attendee ||
      !(start instanceof ICAL.Time) ||
      organizer === email.toLowerCase()
    )
      return null;
    const response = attendee
      .getParameter("partstat")
      ?.toString()
      .toLowerCase();
    return {
      uid,
      organizer,
      attendee: email.toLowerCase(),
      title: String(
        event.getFirstPropertyValue("summary") || "Calendar invitation",
      ),
      start: start.toString(),
      sequence,
      recurrenceId,
      recurring:
        event.hasProperty("rrule") || event.hasProperty("recurrence-id"),
      response:
        response === "accepted" ||
        response === "declined" ||
        response === "tentative"
          ? response
          : null,
      content,
    };
  } catch {
    return null;
  }
}

// Throws on malformed ICS; callers own the error handling.
export function getCalendarInvitationIdentity(content: string) {
  const calendar = new ICAL.Component(ICAL.parse(content));
  if (calendar.name !== "vcalendar") return null;
  const events = calendar.getAllSubcomponents("vevent");
  // A multi-event request needs an explicit event selector before it can be answered.
  if (events.length !== 1) return null;
  const event = events[0];
  const uid = event.getFirstPropertyValue("uid");
  const organizer = getEmail(event.getFirstPropertyValue("organizer"));
  const sequence = event.getFirstPropertyValue("sequence") ?? 0;
  if (
    typeof uid !== "string" ||
    !uid ||
    !organizer ||
    typeof sequence !== "number" ||
    !Number.isInteger(sequence) ||
    sequence < 0
  )
    return null;
  const recurrence = event.getFirstPropertyValue("recurrence-id");
  return {
    method: calendar.getFirstPropertyValue("method"),
    event,
    uid,
    organizer,
    sequence,
    recurrenceId:
      recurrence instanceof ICAL.Time ? recurrence.toString() : null,
  };
}

export function createCalendarReply(
  invitation: CalendarInvitation,
  response: InvitationResponse,
) {
  const original = new ICAL.Component(ICAL.parse(invitation.content));
  const source = original.getFirstSubcomponent("vevent")!;
  const calendar = new ICAL.Component("vcalendar");
  calendar.addPropertyWithValue("prodid", "-//Inbox Zero//Calendar//EN");
  calendar.addPropertyWithValue("version", "2.0");
  calendar.addPropertyWithValue("method", "REPLY");
  for (const zone of original.getAllSubcomponents("vtimezone")) {
    calendar.addSubcomponent(
      new ICAL.Component(structuredClone(zone.toJSON())),
    );
  }
  const event = new ICAL.Component("vevent");
  for (const name of [
    "uid",
    "organizer",
    "sequence",
    "dtstart",
    "dtend",
    "duration",
    "recurrence-id",
    "summary",
  ]) {
    const property = source.getFirstProperty(name);
    if (property)
      event.addProperty(new ICAL.Property(structuredClone(property.toJSON())));
  }
  event.addPropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  const attendee = new ICAL.Property("attendee");
  attendee.setValue(`mailto:${invitation.attendee}`);
  attendee.setParameter("partstat", response.toUpperCase());
  event.addProperty(attendee);
  calendar.addSubcomponent(event);
  return `${calendar.toString()}\r\n`;
}

function getEmail(value: unknown) {
  if (typeof value !== "string" || !value.toLowerCase().startsWith("mailto:"))
    return null;
  const result = z.email().safeParse(value.slice(7));
  return result.success ? result.data.toLowerCase() : null;
}
