import { CALENDAR_INVITATION_LIMITS } from "@/utils/calendar/invitations/constants";
import { findVideoConferenceLink } from "@/utils/calendar/video-conference-link";
import { TZDate } from "@date-fns/tz";
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
      ...getInvitationDetails(event, start),
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

// The details the reader shows alongside the RSVP buttons. Everything here is
// display-only; responding relies on the fields above.
function getInvitationDetails(event: ICAL.Component, start: ICAL.Time) {
  const timeZone = getParameter(event.getFirstProperty("dtstart"), "tzid");
  const location = getText(event, "location");
  return {
    start: toDisplayTime(start, timeZone),
    end: getEndTime(event, start, timeZone),
    allDay: start.isDate,
    location: location?.slice(0, 2000) ?? null,
    conferenceUrl:
      findVideoConferenceLink(
        // Every vendor names the join URL in its own X- property, so scan them
        // all rather than enumerating names that keep growing.
        ...getExtensionValues(event),
        location,
        // Read in full rather than truncated: the description is only scanned
        // for a join link, and invitations bury it in a long agenda.
        getText(event, "description"),
      ) ?? null,
  };
}

// An event may end in a different zone than it starts in, so DTEND carries its
// own TZID. An end derived from DURATION stays in the start's zone.
function getEndTime(
  event: ICAL.Component,
  start: ICAL.Time,
  startTimeZone: string | null,
) {
  const end = event.getFirstPropertyValue("dtend");
  if (end instanceof ICAL.Time)
    return toDisplayTime(
      end,
      getParameter(event.getFirstProperty("dtend"), "tzid"),
    );
  const duration = event.getFirstPropertyValue("duration");
  if (!(duration instanceof ICAL.Duration)) return null;
  const derived = start.clone();
  // Calendar days/weeks retain wall-clock time across DST; timed units advance
  // the instant, after the calendar days (RFC 5545 section 3.3.6).
  derived.addDuration(
    new ICAL.Duration({
      days: duration.days,
      weeks: duration.weeks,
      isNegative: duration.isNegative,
    }),
  );
  const dayEnd = toDisplayTime(derived, startTimeZone);
  const timedDuration = duration.clone();
  timedDuration.days = 0;
  timedDuration.weeks = 0;
  if (dayEnd.endsWith("Z"))
    return new Date(
      Date.parse(dayEnd) + timedDuration.toSeconds() * 1000,
    ).toISOString();
  derived.addDuration(timedDuration);
  return toDisplayTime(derived, startTimeZone);
}

/**
 * Serialises a time for the reader: a plain date for all-day events, an
 * absolute instant when the zone is known, and a floating wall clock otherwise.
 */
function toDisplayTime(time: ICAL.Time, timeZone: string | null) {
  if (time.isDate) return time.toString();
  if (time.zone !== ICAL.Timezone.localTimezone)
    return time.toJSDate().toISOString();
  // ical.js only resolves a TZID that the invitation defines as a VTIMEZONE.
  // Senders that omit it still name a zone the runtime can look up.
  return (timeZone && toInstant(time, timeZone)) ?? time.toString();
}

function toInstant(time: ICAL.Time, timeZone: string) {
  const zoned = new TZDate(
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute,
    time.second,
    timeZone,
  );
  // A TZID the runtime cannot resolve (a Windows zone name) leaves it floating.
  return Number.isNaN(zoned.getTime())
    ? null
    : new Date(zoned.getTime()).toISOString();
}

function getExtensionValues(event: ICAL.Component) {
  return event
    .getAllProperties()
    .filter((property) => property.name.startsWith("x-"))
    .map((property) => {
      const value = property.getFirstValue();
      return typeof value === "string" ? value : null;
    });
}

function getText(event: ICAL.Component, name: string) {
  const value = event.getFirstPropertyValue(name);
  if (typeof value !== "string" || !value) return null;
  return value;
}

function getParameter(property: ICAL.Property | null, name: string) {
  const value = property?.getParameter(name);
  if (typeof value !== "string" || !value) return null;
  return value;
}
