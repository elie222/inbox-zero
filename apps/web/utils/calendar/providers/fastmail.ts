import { randomUUID } from "node:crypto";
import {
  createDAVClient,
  type DAVCalendar,
  type DAVCalendarObject,
} from "tsdav";
import ICAL from "ical.js";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import type {
  CalendarEvent,
  CalendarEventProvider,
  CalendarEventWriteInput,
  CalendarEventUpdateInput,
  CalendarEventCancelInput,
} from "@/utils/calendar/event-types";
import type {
  CalendarInvitation,
  InvitationEvent,
  InvitationResponse,
} from "@/utils/calendar/invitations/parser";
import { findVideoConferenceLink } from "@/utils/calendar/video-conference-link";

const serverUrl = "https://caldav.fastmail.com/";
const eventIdSchema = z.object({
  url: z.string().url(),
  uid: z.string().min(1),
  recurrenceId: z.string().nullable(),
});
type Credentials = { email: string; appPassword: string };

export async function createFastmailCalendarClient(credentials: Credentials) {
  return createDAVClient({
    serverUrl,
    credentials: {
      username: credentials.email,
      password: credentials.appPassword,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetch: async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      assertFastmailUrl(url);
      let target = url;
      for (let redirects = 0; redirects < 5; redirects++) {
        const response = await fetch(target, {
          ...init,
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        if ([301, 302, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location)
            throw new SafeError("Invalid Fastmail calendar redirect.");
          target = new URL(location, target).href;
          assertFastmailUrl(target);
          continue;
        }
        checkResponse(response);
        return response;
      }
      throw new SafeError("Too many Fastmail calendar redirects.");
    },
  });
}

export async function discoverFastmailCalendars(credentials: Credentials) {
  const client = await createFastmailCalendarClient(credentials);
  const calendars = await client.fetchCalendars({
    props: {
      "d:displayname": {},
      "c:calendar-description": {},
      "c:calendar-timezone": {},
      "d:current-user-privilege-set": {},
    },
    projectedProps: { currentUserPrivilegeSet: true },
  });
  return calendars
    .filter(
      (calendar) =>
        !calendar.components || calendar.components.includes("VEVENT"),
    )
    .map((calendar, index) => {
      assertFastmailUrl(calendar.url);
      return {
        calendarId: calendar.url,
        name:
          typeof calendar.displayName === "string"
            ? calendar.displayName
            : "Fastmail calendar",
        description: calendar.description,
        timezone: calendarTimezone(calendar),
        primary: index === 0,
        isReadOnly: !hasWritePrivilege(
          calendar.projectedProps?.currentUserPrivilegeSet,
        ),
      };
    });
}

export class FastmailCalendarProvider implements CalendarEventProvider {
  private readonly connection: Credentials & {
    connectionId: string;
    emailAccountId: string;
  };
  constructor(
    connection: Credentials & { connectionId: string; emailAccountId: string },
  ) {
    this.connection = connection;
  }

  async fetchEvents({
    timeMin = new Date(),
    timeMax = new Date(timeMin.getTime() + 90 * 86_400_000),
    maxResults = 100,
  }: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  } = {}): Promise<CalendarEvent[]> {
    return (await this.readEvents(timeMin, timeMax))
      .map((item) => item.event)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, maxResults);
  }

  async fetchEventsWithAttendee({
    attendeeEmail,
    timeMin,
    timeMax,
    maxResults,
  }: {
    attendeeEmail: string;
    timeMin: Date;
    timeMax: Date;
    maxResults: number;
  }) {
    return (await this.readEvents(timeMin, timeMax))
      .map((item) => item.event)
      .filter((event) =>
        event.attendees.some(
          (attendee) =>
            attendee.email.toLowerCase() === attendeeEmail.toLowerCase(),
        ),
      )
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, maxResults);
  }

  async fetchBusyPeriods(timeMin: Date, timeMax: Date) {
    return (await this.readEvents(timeMin, timeMax))
      .filter((item) => item.busy)
      .map(({ event }) => ({
        start: event.startTime.toISOString(),
        end: event.endTime.toISOString(),
      }));
  }

  async createEvent(input: CalendarEventWriteInput) {
    if (
      input.locationType === "GOOGLE_MEET" ||
      input.locationType === "MICROSOFT_TEAMS"
    )
      throw new SafeError(
        "Choose a custom meeting link, phone, or physical location for Fastmail.",
      );
    const { client, calendar } = await this.getCalendar(input.calendarId);
    const uid = randomUUID();
    const component = new ICAL.Component("vcalendar");
    component.addPropertyWithValue("version", "2.0");
    component.addPropertyWithValue(
      "prodid",
      "-//Inbox Zero//Fastmail Calendar//EN",
    );
    const event = new ICAL.Component("vevent");
    event.addPropertyWithValue("uid", uid);
    event.addPropertyWithValue("sequence", 0);
    event.addPropertyWithValue(
      "dtstamp",
      ICAL.Time.fromJSDate(new Date(), true),
    );
    event.addPropertyWithValue(
      "dtstart",
      ICAL.Time.fromJSDate(input.startTime, true),
    );
    event.addPropertyWithValue(
      "dtend",
      ICAL.Time.fromJSDate(input.endTime, true),
    );
    event.addPropertyWithValue("summary", input.title);
    if (input.description)
      event.addPropertyWithValue("description", input.description);
    if (input.locationValue)
      event.addPropertyWithValue("location", input.locationValue);
    event.addPropertyWithValue("organizer", `mailto:${this.connection.email}`);
    for (const attendee of input.attendees) {
      const property = new ICAL.Property("attendee");
      property.setValue(`mailto:${attendee.email}`);
      if (attendee.name) property.setParameter("cn", attendee.name);
      property.setParameter("partstat", "NEEDS-ACTION");
      property.setParameter("rsvp", "TRUE");
      event.addProperty(property);
    }
    component.addSubcomponent(event);
    const filename = `${uid}.ics`;
    checkResponse(
      await client.createCalendarObject({
        calendar,
        filename,
        iCalString: component.toString(),
        headers: { "If-None-Match": "*" },
      }),
    );
    return {
      id: encodeEventId(
        new URL(
          filename,
          calendar.url.endsWith("/") ? calendar.url : `${calendar.url}/`,
        ).href,
        event,
      ),
      providerCalendarId: calendar.url,
      videoConferenceLink: findVideoConferenceLink(input.locationValue),
    };
  }

  async updateEvent(input: CalendarEventUpdateInput) {
    const { client, object, component, event } = await this.readObject(
      input.calendarId,
      input.eventId,
    );
    this.assertOrganizer(event);
    event.updatePropertyWithValue(
      "dtstart",
      ICAL.Time.fromJSDate(input.startTime, true),
    );
    event.removeAllProperties("duration");
    event.updatePropertyWithValue(
      "dtend",
      ICAL.Time.fromJSDate(input.endTime, true),
    );
    bumpSequence(event);
    checkResponse(
      await client.updateCalendarObject({
        calendarObject: { ...object, data: component.toString() },
      }),
    );
  }

  async cancelEvent(input: CalendarEventCancelInput) {
    const { client, object, component, event } = await this.readObject(
      input.calendarId,
      input.eventId,
    );
    this.assertOrganizer(event);
    if (event.hasProperty("recurrence-id")) {
      event.updatePropertyWithValue("status", "CANCELLED");
      bumpSequence(event);
      checkResponse(
        await client.updateCalendarObject({
          calendarObject: { ...object, data: component.toString() },
        }),
      );
    } else
      checkResponse(
        await client.deleteCalendarObject({ calendarObject: object }),
      );
  }

  async findInvitationEvent(
    invitation: CalendarInvitation,
  ): Promise<InvitationEvent | null> {
    const client = await createFastmailCalendarClient(this.connection);
    const calendars = await this.enabledCalendars();
    const matches: InvitationEvent[] = [];
    for (const calendar of calendars) {
      assertFastmailUrl(calendar.calendarId);
      const objects = await client.fetchCalendarObjects({
        calendar: { url: calendar.calendarId },
        filters: [
          {
            "comp-filter": {
              _attributes: { name: "VCALENDAR" },
              "comp-filter": {
                _attributes: { name: "VEVENT" },
                "prop-filter": {
                  _attributes: { name: "UID" },
                  "text-match": {
                    _attributes: { collation: "i;octet" },
                    _text: invitation.uid,
                  },
                },
              },
            },
          },
        ],
      });
      for (const object of objects) {
        const component = parseCalendarObject(object);
        for (const event of component.getAllSubcomponents("vevent")) {
          if (
            event.getFirstPropertyValue("uid") !== invitation.uid ||
            recurrenceId(event) !== invitation.recurrenceId
          )
            continue;
          if (
            emailValue(event.getFirstPropertyValue("organizer")) !==
            invitation.organizer.toLowerCase()
          )
            continue;
          const attendee = event
            .getAllProperties("attendee")
            .find(
              (property) =>
                emailValue(property.getFirstValue()) ===
                invitation.attendee.toLowerCase(),
            );
          if (!attendee) continue;
          if (
            Number(event.getFirstPropertyValue("sequence") ?? 0) !==
            invitation.sequence
          )
            throw new SafeError(
              "This invitation has changed. Open the latest invitation.",
            );
          matches.push({
            id: encodeEventId(object.url, event),
            response:
              attendee.getParameter("partstat")?.toString().toLowerCase() ??
              null,
          });
        }
      }
    }
    if (matches.length > 1)
      throw new SafeError(
        "This invitation matches multiple calendars. Respond from Fastmail.",
      );
    return matches[0] ?? null;
  }

  async respondToInvitation(
    id: string,
    invitation: CalendarInvitation,
    response: InvitationResponse,
  ) {
    const identity = decodeEventId(id);
    const calendars = await this.enabledCalendars();
    const calendar = calendars.find((entry) =>
      isCalendarObjectUrl(entry.calendarId, identity.url),
    );
    if (!calendar) throw new SafeError("Calendar event not found");
    const { client, object, component, event } = await this.readObject(
      calendar.calendarId,
      id,
    );
    if (
      identity.uid !== invitation.uid ||
      recurrenceId(event) !== invitation.recurrenceId ||
      emailValue(event.getFirstPropertyValue("organizer")) !==
        invitation.organizer.toLowerCase() ||
      Number(event.getFirstPropertyValue("sequence") ?? 0) !==
        invitation.sequence
    )
      throw new SafeError(
        "This invitation has changed. Open the latest invitation.",
      );
    const attendee = event
      .getAllProperties("attendee")
      .find(
        (property) =>
          emailValue(property.getFirstValue()) ===
          invitation.attendee.toLowerCase(),
      );
    if (
      !attendee ||
      invitation.attendee.toLowerCase() !== this.connection.email.toLowerCase()
    )
      throw new SafeError(
        "This invitation belongs to another calendar account.",
      );
    attendee.setParameter("partstat", response.toUpperCase());
    attendee.setParameter("rsvp", "FALSE");
    checkResponse(
      await client.updateCalendarObject({
        calendarObject: { ...object, data: component.toString() },
      }),
    );
  }

  private async enabledCalendars() {
    return prisma.calendar.findMany({
      where: {
        connectionId: this.connection.connectionId,
        isEnabled: true,
        connection: {
          emailAccountId: this.connection.emailAccountId,
          isConnected: true,
        },
      },
      select: { calendarId: true, timezone: true, isReadOnly: true },
    });
  }

  private async readEvents(start: Date, end: Date) {
    const client = await createFastmailCalendarClient(this.connection);
    const events: ReturnType<typeof parseFastmailCalendarEvents> = [];
    for (const calendar of await this.enabledCalendars()) {
      assertFastmailUrl(calendar.calendarId);
      const objects = await client.fetchCalendarObjects({
        calendar: { url: calendar.calendarId },
        timeRange: { start: start.toISOString(), end: end.toISOString() },
        expand: true,
      });
      for (const object of objects)
        events.push(
          ...parseFastmailCalendarEvents(
            object,
            this.connection.email,
            calendar.timezone ?? "UTC",
            start,
            end,
          ),
        );
    }
    return events;
  }

  private async getCalendar(id: string) {
    assertFastmailUrl(id);
    const selected = (await this.enabledCalendars()).find(
      (calendar) => calendar.calendarId === id,
    );
    if (!selected) throw new SafeError("Calendar is unavailable or disabled.");
    if (selected.isReadOnly) throw new SafeError("This calendar is read-only.");
    const client = await createFastmailCalendarClient(this.connection);
    return { client, calendar: { url: id } as DAVCalendar };
  }

  private async readObject(calendarId: string, id: string) {
    const identity = decodeEventId(id);
    if (!isCalendarObjectUrl(calendarId, identity.url))
      throw new SafeError("Event does not belong to this calendar.");
    const { client, calendar } = await this.getCalendar(calendarId);
    const objects = await client.fetchCalendarObjects({
      calendar,
      objectUrls: [identity.url],
    });
    const object = objects.find(
      (item) => new URL(item.url).href === new URL(identity.url).href,
    );
    if (!object?.etag)
      throw new SafeError("Calendar event not found or missing its version.");
    const component = parseCalendarObject(object);
    let event = component
      .getAllSubcomponents("vevent")
      .find(
        (entry) =>
          entry.getFirstPropertyValue("uid") === identity.uid &&
          recurrenceId(entry) === identity.recurrenceId,
      );
    if (!event && identity.recurrenceId) {
      const master = component
        .getAllSubcomponents("vevent")
        .find(
          (entry) =>
            entry.getFirstPropertyValue("uid") === identity.uid &&
            !entry.hasProperty("recurrence-id"),
        );
      if (master) {
        const series = new ICAL.Event(master);
        const target = ICAL.Time.fromString(
          identity.recurrenceId,
          master.getFirstProperty("dtstart"),
        );
        const iterator = series.iterator();
        for (let count = 0; count < 100_000; count++) {
          const occurrence = iterator.next();
          if (!occurrence || occurrence.compare(target) > 0) break;
          if (occurrence.toString() !== identity.recurrenceId) continue;
          const details = series.getOccurrenceDetails(occurrence);
          event = new ICAL.Component(
            JSON.parse(JSON.stringify(details.item.component.toJSON())),
          );
          for (const property of [
            "rrule",
            "rdate",
            "exdate",
            "exrule",
            "duration",
          ])
            event.removeAllProperties(property);
          event.updatePropertyWithValue("recurrence-id", occurrence);
          event.updatePropertyWithValue("dtstart", details.startDate);
          event.updatePropertyWithValue("dtend", details.endDate);
          component.addSubcomponent(event);
          break;
        }
      }
    }
    if (!event)
      throw new SafeError(
        "This occurrence changed. Open the event in Fastmail.",
      );
    return { client, object, component, event };
  }

  private assertOrganizer(event: ICAL.Component) {
    if (
      emailValue(event.getFirstPropertyValue("organizer")) !==
      this.connection.email.toLowerCase()
    )
      throw new SafeError("Only the organizer can modify this event.");
  }
}

export function parseFastmailCalendarEvents(
  object: DAVCalendarObject,
  email: string,
  timezone: string,
  start: Date,
  end: Date,
) {
  const calendar = parseCalendarObject(object);
  const output: { event: CalendarEvent; busy: boolean }[] = [];
  const components = calendar.getAllSubcomponents("vevent");
  for (const component of components) {
    const event = new ICAL.Event(component);
    if (component.getFirstPropertyValue("status") === "CANCELLED") continue;
    if (
      event.isRecurrenceException() &&
      components.some(
        (candidate) =>
          candidate.getFirstPropertyValue("uid") === event.uid &&
          candidate.hasProperty("rrule"),
      )
    )
      continue;
    const add = (
      item: ICAL.Event,
      startTime: ICAL.Time,
      endTime: ICAL.Time,
      recurrence?: ICAL.Time,
    ) => {
      if (item.component.getFirstPropertyValue("status") === "CANCELLED")
        return;
      const begin = calendarDate(startTime, timezone);
      const finish = calendarDate(endTime, timezone);
      if (begin >= end || finish <= start) return;
      const attendees = item.component
        .getAllProperties("attendee")
        .map((property) => ({
          email: emailValue(property.getFirstValue()),
          name: property.getParameter("cn")?.toString(),
          declined: property.getParameter("partstat") === "DECLINED",
        }));
      const organizer = emailValue(
        item.component.getFirstPropertyValue("organizer"),
      );
      const description = String(
        item.component.getFirstPropertyValue("description") ?? "",
      );
      const location = String(
        item.component.getFirstPropertyValue("location") ?? "",
      );
      output.push({
        event: {
          id: encodeEventId(object.url, item.component, recurrence?.toString()),
          title: item.summary || "Untitled event",
          startTime: begin,
          endTime: finish,
          attendees,
          organizerEmail: organizer,
          isOrganizer: organizer === email.toLowerCase(),
          description,
          location,
          videoConferenceLink: findVideoConferenceLink(location, description),
        },
        busy:
          item.component.getFirstPropertyValue("transp") !== "TRANSPARENT" &&
          !attendees.some(
            (attendee) =>
              attendee.email === email.toLowerCase() && attendee.declined,
          ),
      });
    };
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    let exhausted = false;
    for (let count = 0; count < 100_000; count++) {
      const next = iterator.next();
      if (!next || calendarDate(next, timezone) >= end) {
        exhausted = true;
        break;
      }
      const occurrence = event.getOccurrenceDetails(next);
      add(occurrence.item, occurrence.startDate, occurrence.endDate, next);
    }
    if (!exhausted)
      throw new SafeError(
        "Calendar recurrence exceeds the supported expansion limit.",
      );
  }
  return output;
}

function parseCalendarObject(object: DAVCalendarObject) {
  if (typeof object.data !== "string" || object.data.length > 5_000_000)
    throw new SafeError("Invalid calendar event data");
  return new ICAL.Component(ICAL.parse(object.data));
}
function calendarDate(time: ICAL.Time, timezone: string) {
  if (time.isDate || time.zone.tzid === "floating")
    return new Date(
      new TZDate(
        time.year,
        time.month - 1,
        time.day,
        time.hour,
        time.minute,
        time.second,
        timezone,
      ).getTime(),
    );
  return time.toJSDate();
}
function calendarTimezone(calendar: DAVCalendar) {
  if (!calendar.timezone) return "UTC";
  try {
    return String(
      new ICAL.Component(ICAL.parse(calendar.timezone))
        .getFirstSubcomponent("vtimezone")
        ?.getFirstPropertyValue("tzid") ?? "UTC",
    );
  } catch {
    return "UTC";
  }
}
function recurrenceId(event: ICAL.Component) {
  const value = event.getFirstPropertyValue("recurrence-id");
  return value instanceof ICAL.Time ? value.toString() : null;
}
function encodeEventId(
  url: string,
  event: ICAL.Component,
  recurrence?: string,
) {
  return Buffer.from(
    JSON.stringify({
      url,
      uid: event.getFirstPropertyValue("uid"),
      recurrenceId: recurrence ?? recurrenceId(event),
    }),
  ).toString("base64url");
}
function decodeEventId(id: string) {
  const value = eventIdSchema.parse(
    JSON.parse(Buffer.from(id, "base64url").toString()),
  );
  assertFastmailUrl(value.url);
  return value;
}
function emailValue(value: unknown) {
  return String(value ?? "")
    .replace(/^mailto:/i, "")
    .toLowerCase();
}
function assertFastmailUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== new URL(serverUrl).origin || url.username || url.password)
    throw new SafeError("Invalid Fastmail calendar URL");
}
function isCalendarObjectUrl(calendar: string, object: string) {
  assertFastmailUrl(calendar);
  assertFastmailUrl(object);
  return new URL(object).pathname.startsWith(
    new URL(calendar).pathname.replace(/\/?$/, "/"),
  );
}
function checkResponse(response: Response) {
  if (!response.ok)
    throw new SafeError(
      response.status === 412
        ? "This event changed in another client. Reload it before editing."
        : `Fastmail calendar request failed: ${response.status}`,
    );
}
function bumpSequence(event: ICAL.Component) {
  event.updatePropertyWithValue(
    "sequence",
    Number(event.getFirstPropertyValue("sequence") ?? 0) + 1,
  );
  event.updatePropertyWithValue(
    "dtstamp",
    ICAL.Time.fromJSDate(new Date(), true),
  );
}

function hasWritePrivilege(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasWritePrivilege);
  return Object.entries(value).some(
    ([key, child]) =>
      ["all", "write", "writeContent"].includes(key) ||
      hasWritePrivilege(child),
  );
}
