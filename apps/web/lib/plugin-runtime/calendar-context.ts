/**
 * Calendar Context Factory
 *
 * Creates PluginCalendar instances with permission-gated access to Google and Microsoft calendars.
 * Supports full CRUD operations with RSVP/attendee data included in CalendarEvent responses.
 */

import type { calendar_v3 } from "@googleapis/calendar";
import type { Client } from "@microsoft/microsoft-graph-client";
import type {
  PluginCalendar,
  Calendar,
  CalendarEvent,
  CreateEventInput,
  UpdateEventInput,
  RespondToEventInput,
  CalendarEventAttendee,
  ListEventsOptions,
  GetBusyPeriodsOptions,
  ListEventsWithAttendeeOptions,
  BusyPeriod,
  AttendeeResponseStatus,
  CalendarEventStatus,
} from "@/packages/plugin-sdk/src/types/calendar";
import type { PluginCapability } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import { PluginCapabilityError } from "./context-factory";
import {
  getCalendarClientWithRefresh,
  fetchGoogleCalendars,
} from "@/utils/calendar/client";
import {
  getCalendarClientWithRefresh as getMicrosoftCalendarClient,
  fetchMicrosoftCalendars,
} from "@/utils/outlook/calendar-client";
import prisma from "@/utils/prisma";
import { createScopedLogger, type Logger } from "@/utils/logger";

const logger = createScopedLogger("plugin-runtime/calendar");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CalendarConnectionParams {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}

interface CalendarConnection {
  id: string;
  provider: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  calendars: Array<{
    id: string;
    calendarId: string;
    name: string;
    description: string | null;
    timezone: string | null;
    isEnabled: boolean;
  }>;
}

// -----------------------------------------------------------------------------
// Google Calendar Implementation
// -----------------------------------------------------------------------------

class GoogleCalendarAdapter {
  private readonly connection: CalendarConnectionParams;
  private readonly logger: Logger;
  private client: calendar_v3.Calendar | null = null;

  constructor(connection: CalendarConnectionParams, log: Logger) {
    this.connection = connection;
    this.logger = log;
  }

  private async getClient(): Promise<calendar_v3.Calendar> {
    if (!this.client) {
      this.client = await getCalendarClientWithRefresh({
        accessToken: this.connection.accessToken,
        refreshToken: this.connection.refreshToken,
        expiresAt: this.connection.expiresAt,
        emailAccountId: this.connection.emailAccountId,
        logger: this.logger,
      });
    }
    return this.client;
  }

  async listCalendars(): Promise<Calendar[]> {
    const client = await this.getClient();
    const calendars = await fetchGoogleCalendars(client, this.logger);

    return calendars.map((cal) => ({
      id: cal.id || "",
      name: cal.summary || "Untitled Calendar",
      primary: cal.primary ?? false,
      description: cal.description ?? undefined,
      canEdit: cal.accessRole === "owner" || cal.accessRole === "writer",
    }));
  }

  async listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    const client = await this.getClient();
    const calendarId = options.calendarId || "primary";

    const response = await client.events.list({
      calendarId,
      timeMin: options.timeMin?.toISOString(),
      timeMax: options.timeMax?.toISOString(),
      maxResults: options.maxResults ?? 100,
      q: options.q,
      singleEvents: true,
      orderBy: "startTime",
    });

    return (response.data.items || []).map((event) =>
      this.parseEvent(event, calendarId),
    );
  }

  async getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const response = await client.events.get({
      calendarId: targetCalendarId,
      eventId,
    });

    return this.parseEvent(response.data, targetCalendarId);
  }

  async getBusyPeriods(options: GetBusyPeriodsOptions): Promise<BusyPeriod[]> {
    const client = await this.getClient();

    // use provided calendar IDs or default to primary
    const calendarIds = options.calendarIds?.length
      ? options.calendarIds
      : ["primary"];

    const response = await client.freebusy.query({
      requestBody: {
        timeMin: options.timeMin.toISOString(),
        timeMax: options.timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const busyPeriods: BusyPeriod[] = [];

    if (response.data.calendars) {
      for (const calendar of Object.values(response.data.calendars)) {
        if (calendar.busy) {
          for (const period of calendar.busy) {
            if (period.start && period.end) {
              busyPeriods.push({
                start: period.start,
                end: period.end,
              });
            }
          }
        }
      }
    }

    return busyPeriods;
  }

  async listEventsWithAttendee(
    options: ListEventsWithAttendeeOptions,
  ): Promise<CalendarEvent[]> {
    const client = await this.getClient();

    // use the q parameter to search for events containing the attendee's email
    const response = await client.events.list({
      calendarId: "primary",
      timeMin: options.timeMin.toISOString(),
      timeMax: options.timeMax.toISOString(),
      maxResults: (options.maxResults ?? 10) * 3, // fetch more to filter
      q: options.attendeeEmail,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    // filter to events that actually have this attendee
    const filteredEvents = events
      .filter((event) =>
        event.attendees?.some(
          (a) => a.email?.toLowerCase() === options.attendeeEmail.toLowerCase(),
        ),
      )
      .slice(0, options.maxResults ?? 10);

    return filteredEvents.map((event) => this.parseEvent(event, "primary"));
  }

  async createEvent(
    event: CreateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const response = await client.events.insert({
      calendarId: targetCalendarId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: event.start.date
          ? { date: event.start.date }
          : {
              dateTime: event.start.dateTime,
              timeZone: event.start.timeZone,
            },
        end: event.end.date
          ? { date: event.end.date }
          : {
              dateTime: event.end.dateTime,
              timeZone: event.end.timeZone,
            },
        location: event.location,
        attendees: event.attendees?.map((a) => ({
          email: a.email,
          displayName: a.name,
        })),
        recurrence: event.recurrence,
      },
    });

    return this.parseEvent(response.data, targetCalendarId);
  }

  async updateEvent(
    eventId: string,
    event: UpdateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const requestBody: calendar_v3.Schema$Event = {};

    if (event.summary !== undefined) {
      requestBody.summary = event.summary;
    }
    if (event.description !== undefined) {
      requestBody.description = event.description;
    }
    if (event.start !== undefined) {
      requestBody.start = event.start.date
        ? { date: event.start.date }
        : {
            dateTime: event.start.dateTime,
            timeZone: event.start.timeZone,
          };
    }
    if (event.end !== undefined) {
      requestBody.end = event.end.date
        ? { date: event.end.date }
        : {
            dateTime: event.end.dateTime,
            timeZone: event.end.timeZone,
          };
    }
    if (event.location !== undefined) {
      requestBody.location = event.location;
    }
    if (event.attendees !== undefined) {
      requestBody.attendees = event.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
      }));
    }
    if (event.status !== undefined) {
      requestBody.status = event.status;
    }
    if (event.recurrence !== undefined) {
      requestBody.recurrence = event.recurrence;
    }

    const response = await client.events.patch({
      calendarId: targetCalendarId,
      eventId,
      requestBody,
    });

    return this.parseEvent(response.data, targetCalendarId);
  }

  async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    await client.events.delete({
      calendarId: targetCalendarId,
      eventId,
    });
  }

  async respondToEvent(
    eventId: string,
    input: RespondToEventInput,
    calendarId?: string,
  ): Promise<void> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    // get the current event to find our attendee entry
    const response = await client.events.get({
      calendarId: targetCalendarId,
      eventId,
    });

    const event = response.data;
    if (!event.attendees) {
      throw new Error("Event has no attendees to respond as");
    }

    // find the self attendee and update their response status
    const updatedAttendees = event.attendees.map((attendee) => {
      if (attendee.self) {
        return {
          ...attendee,
          responseStatus: input.response,
          comment: input.comment,
        };
      }
      return attendee;
    });

    // update the event with the new response status
    await client.events.patch({
      calendarId: targetCalendarId,
      eventId,
      sendUpdates: input.sendResponse !== false ? "all" : "none",
      requestBody: {
        attendees: updatedAttendees,
      },
    });
  }

  private parseEvent(
    event: calendar_v3.Schema$Event,
    calendarId: string,
  ): CalendarEvent {
    const attendees: CalendarEventAttendee[] =
      event.attendees?.map((a) => ({
        email: a.email || "",
        name: a.displayName ?? undefined,
        responseStatus: this.mapGoogleResponseStatus(a.responseStatus),
        organizer: a.organizer ?? undefined,
        self: a.self ?? undefined,
      })) ?? [];

    // extract video conference link
    let videoConferenceLink: string | undefined =
      event.hangoutLink ?? undefined;
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find(
        (entry) => entry.entryPointType === "video",
      );
      videoConferenceLink = videoEntry?.uri ?? videoConferenceLink;
    }

    return {
      id: event.id || "",
      calendarId,
      summary: event.summary || "Untitled",
      description: event.description ?? undefined,
      start: {
        dateTime: event.start?.dateTime ?? undefined,
        date: event.start?.date ?? undefined,
        timeZone: event.start?.timeZone ?? undefined,
      },
      end: {
        dateTime: event.end?.dateTime ?? undefined,
        date: event.end?.date ?? undefined,
        timeZone: event.end?.timeZone ?? undefined,
      },
      location: event.location ?? undefined,
      attendees: attendees.length > 0 ? attendees : undefined,
      status: this.mapGoogleEventStatus(event.status),
      organizer: event.organizer
        ? {
            email: event.organizer.email || "",
            name: event.organizer.displayName ?? undefined,
          }
        : undefined,
      eventUrl: event.htmlLink ?? undefined,
      videoConferenceLink,
      recurrence: event.recurrence ?? undefined,
      recurringEventId: event.recurringEventId ?? undefined,
    };
  }

  private mapGoogleResponseStatus(
    status: string | null | undefined,
  ): AttendeeResponseStatus {
    switch (status) {
      case "accepted":
        return "accepted";
      case "declined":
        return "declined";
      case "tentative":
        return "tentative";
      default:
        return "needsAction";
    }
  }

  private mapGoogleEventStatus(
    status: string | null | undefined,
  ): CalendarEventStatus | undefined {
    switch (status) {
      case "confirmed":
        return "confirmed";
      case "tentative":
        return "tentative";
      case "cancelled":
        return "cancelled";
      default:
        return undefined;
    }
  }
}

// -----------------------------------------------------------------------------
// Microsoft Calendar Implementation
// -----------------------------------------------------------------------------

interface MicrosoftEvent {
  id?: string;
  subject?: string;
  body?: { content?: string; contentType?: string };
  bodyPreview?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
    status?: { response?: string };
    type?: string;
  }>;
  organizer?: {
    emailAddress?: { address?: string; name?: string };
  };
  showAs?: string;
  isCancelled?: boolean;
  webLink?: string;
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
  isAllDay?: boolean;
  recurrence?: {
    pattern?: { type?: string; interval?: number; daysOfWeek?: string[] };
    range?: { type?: string; startDate?: string; endDate?: string };
  };
  seriesMasterId?: string;
}

interface MicrosoftCalendar {
  id?: string;
  name?: string;
  description?: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
  owner?: { address?: string; name?: string };
}

interface MicrosoftScheduleItem {
  status?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
}

class MicrosoftCalendarAdapter {
  private readonly connection: CalendarConnectionParams;
  private readonly logger: Logger;
  private client: Client | null = null;

  constructor(connection: CalendarConnectionParams, log: Logger) {
    this.connection = connection;
    this.logger = log;
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.client = await getMicrosoftCalendarClient({
        accessToken: this.connection.accessToken,
        refreshToken: this.connection.refreshToken,
        expiresAt: this.connection.expiresAt,
        emailAccountId: this.connection.emailAccountId,
        logger: this.logger,
      });
    }
    return this.client;
  }

  async listCalendars(): Promise<Calendar[]> {
    const client = await this.getClient();
    const calendars = await fetchMicrosoftCalendars(client, this.logger);

    return calendars.map((cal: MicrosoftCalendar) => ({
      id: cal.id || "",
      name: cal.name || "Untitled Calendar",
      primary: cal.isDefaultCalendar ?? false,
      description: cal.description ?? undefined,
      canEdit: cal.canEdit ?? true,
    }));
  }

  async listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    const client = await this.getClient();
    const calendarId = options.calendarId || "primary";

    const calendarPath =
      calendarId === "primary"
        ? "/me/calendar/events"
        : `/me/calendars/${calendarId}/events`;

    let request = client
      .api(calendarPath)
      .orderby("start/dateTime")
      .top(options.maxResults ?? 100);

    const filterParts: string[] = [];
    if (options.timeMin) {
      filterParts.push(`start/dateTime ge '${options.timeMin.toISOString()}'`);
    }
    if (options.timeMax) {
      filterParts.push(`end/dateTime le '${options.timeMax.toISOString()}'`);
    }
    if (filterParts.length > 0) {
      request = request.filter(filterParts.join(" and "));
    }

    if (options.q) {
      request = request.search(`"${options.q}"`);
    }

    const response = await request.get();
    const events: MicrosoftEvent[] = response.value || [];

    return events.map((event) => this.parseEvent(event, calendarId));
  }

  async getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const eventPath =
      targetCalendarId === "primary"
        ? `/me/calendar/events/${eventId}`
        : `/me/calendars/${targetCalendarId}/events/${eventId}`;

    const response = await client.api(eventPath).get();

    return this.parseEvent(response, targetCalendarId);
  }

  async getBusyPeriods(options: GetBusyPeriodsOptions): Promise<BusyPeriod[]> {
    const client = await this.getClient();

    // Microsoft Graph uses getSchedule endpoint for free/busy info
    // note: this requires the user's email address for the schedules parameter
    const response = await client.api("/me/calendar/getSchedule").post({
      schedules: ["me"],
      startTime: {
        dateTime: options.timeMin.toISOString(),
        timeZone: "UTC",
      },
      endTime: {
        dateTime: options.timeMax.toISOString(),
        timeZone: "UTC",
      },
      availabilityViewInterval: 30,
    });

    const busyPeriods: BusyPeriod[] = [];

    if (response.value?.[0]?.scheduleItems) {
      for (const item of response.value[0]
        .scheduleItems as MicrosoftScheduleItem[]) {
        // include busy, tentative, and out-of-office statuses
        if (
          item.status === "busy" ||
          item.status === "tentative" ||
          item.status === "oof"
        ) {
          if (item.start?.dateTime && item.end?.dateTime) {
            busyPeriods.push({
              start: item.start.dateTime,
              end: item.end.dateTime,
            });
          }
        }
      }
    }

    return busyPeriods;
  }

  async listEventsWithAttendee(
    options: ListEventsWithAttendeeOptions,
  ): Promise<CalendarEvent[]> {
    const client = await this.getClient();

    const response = await client
      .api("/me/calendar/events")
      .filter(
        `start/dateTime ge '${options.timeMin.toISOString()}' and end/dateTime le '${options.timeMax.toISOString()}'`,
      )
      .top((options.maxResults ?? 10) * 3) // fetch more to filter
      .orderby("start/dateTime")
      .get();

    const events: MicrosoftEvent[] = response.value || [];

    // filter to events that have this attendee
    const filteredEvents = events
      .filter((event) =>
        event.attendees?.some(
          (a) =>
            a.emailAddress?.address?.toLowerCase() ===
            options.attendeeEmail.toLowerCase(),
        ),
      )
      .slice(0, options.maxResults ?? 10);

    return filteredEvents.map((event) => this.parseEvent(event, "primary"));
  }

  async createEvent(
    event: CreateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const eventPath =
      targetCalendarId === "primary"
        ? "/me/calendar/events"
        : `/me/calendars/${targetCalendarId}/events`;

    const requestBody: Record<string, unknown> = {
      subject: event.summary,
      body: event.description
        ? {
            contentType: "text",
            content: event.description,
          }
        : undefined,
      location: event.location
        ? {
            displayName: event.location,
          }
        : undefined,
      attendees: event.attendees?.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        type: "required",
      })),
    };

    // handle all-day events vs timed events
    if (event.start.date) {
      requestBody.isAllDay = true;
      requestBody.start = {
        dateTime: `${event.start.date}T00:00:00`,
        timeZone: event.start.timeZone || "UTC",
      };
      requestBody.end = {
        dateTime: `${event.end.date}T00:00:00`,
        timeZone: event.end.timeZone || "UTC",
      };
    } else {
      requestBody.start = {
        dateTime: event.start.dateTime,
        timeZone: event.start.timeZone || "UTC",
      };
      requestBody.end = {
        dateTime: event.end.dateTime,
        timeZone: event.end.timeZone || "UTC",
      };
    }

    // handle recurrence if provided
    if (event.recurrence?.length) {
      const recurrenceRule = this.parseRRuleToMicrosoft(event.recurrence[0]);
      if (recurrenceRule) {
        requestBody.recurrence = recurrenceRule;
      }
    }

    const response = await client.api(eventPath).post(requestBody);

    return this.parseEvent(response, targetCalendarId);
  }

  async updateEvent(
    eventId: string,
    event: UpdateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const eventPath =
      targetCalendarId === "primary"
        ? `/me/calendar/events/${eventId}`
        : `/me/calendars/${targetCalendarId}/events/${eventId}`;

    const updateData: Record<string, unknown> = {};

    if (event.summary !== undefined) {
      updateData.subject = event.summary;
    }
    if (event.description !== undefined) {
      updateData.body = {
        contentType: "text",
        content: event.description,
      };
    }
    if (event.start !== undefined) {
      if (event.start.date) {
        updateData.isAllDay = true;
        updateData.start = {
          dateTime: `${event.start.date}T00:00:00`,
          timeZone: event.start.timeZone || "UTC",
        };
      } else {
        updateData.start = {
          dateTime: event.start.dateTime,
          timeZone: event.start.timeZone || "UTC",
        };
      }
    }
    if (event.end !== undefined) {
      if (event.end.date) {
        updateData.end = {
          dateTime: `${event.end.date}T00:00:00`,
          timeZone: event.end.timeZone || "UTC",
        };
      } else {
        updateData.end = {
          dateTime: event.end.dateTime,
          timeZone: event.end.timeZone || "UTC",
        };
      }
    }
    if (event.location !== undefined) {
      updateData.location = {
        displayName: event.location,
      };
    }
    if (event.attendees !== undefined) {
      updateData.attendees = event.attendees.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        type: "required",
      }));
    }
    if (event.status !== undefined) {
      updateData.isCancelled = event.status === "cancelled";
    }
    if (event.recurrence !== undefined) {
      if (event.recurrence.length === 0) {
        updateData.recurrence = null; // remove recurrence
      } else {
        const recurrenceRule = this.parseRRuleToMicrosoft(event.recurrence[0]);
        if (recurrenceRule) {
          updateData.recurrence = recurrenceRule;
        }
      }
    }

    const response = await client.api(eventPath).patch(updateData);

    return this.parseEvent(response, targetCalendarId);
  }

  async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    const eventPath =
      targetCalendarId === "primary"
        ? `/me/calendar/events/${eventId}`
        : `/me/calendars/${targetCalendarId}/events/${eventId}`;

    await client.api(eventPath).delete();
  }

  async respondToEvent(
    eventId: string,
    input: RespondToEventInput,
    calendarId?: string,
  ): Promise<void> {
    const client = await this.getClient();
    const targetCalendarId = calendarId || "primary";

    // microsoft uses dedicated endpoints for each response type
    const responseAction =
      input.response === "accepted"
        ? "accept"
        : input.response === "declined"
          ? "decline"
          : "tentativelyAccept";

    const eventPath =
      targetCalendarId === "primary"
        ? `/me/calendar/events/${eventId}/${responseAction}`
        : `/me/calendars/${targetCalendarId}/events/${eventId}/${responseAction}`;

    await client.api(eventPath).post({
      comment: input.comment,
      sendResponse: input.sendResponse ?? true,
    });
  }

  private parseEvent(event: MicrosoftEvent, calendarId: string): CalendarEvent {
    const attendees: CalendarEventAttendee[] =
      event.attendees?.map((a) => ({
        email: a.emailAddress?.address || "",
        name: a.emailAddress?.name ?? undefined,
        responseStatus: this.mapMicrosoftResponseStatus(a.status?.response),
        organizer:
          a.emailAddress?.address?.toLowerCase() ===
          event.organizer?.emailAddress?.address?.toLowerCase(),
        self: false, // Microsoft doesn't provide this directly
      })) ?? [];

    // extract video conference link
    const videoConferenceLink =
      event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || undefined;

    // convert Microsoft recurrence to RRULE format for consistency
    const recurrence = event.recurrence
      ? [this.microsoftRecurrenceToRRule(event.recurrence)]
      : undefined;

    return {
      id: event.id || "",
      calendarId,
      summary: event.subject || "Untitled",
      description: event.bodyPreview ?? event.body?.content ?? undefined,
      start: event.isAllDay
        ? {
            date: event.start?.dateTime?.split("T")[0],
            timeZone: event.start?.timeZone ?? undefined,
          }
        : {
            dateTime: event.start?.dateTime || new Date().toISOString(),
            timeZone: event.start?.timeZone ?? undefined,
          },
      end: event.isAllDay
        ? {
            date: event.end?.dateTime?.split("T")[0],
            timeZone: event.end?.timeZone ?? undefined,
          }
        : {
            dateTime: event.end?.dateTime || new Date().toISOString(),
            timeZone: event.end?.timeZone ?? undefined,
          },
      location: event.location?.displayName ?? undefined,
      attendees: attendees.length > 0 ? attendees : undefined,
      status: this.mapMicrosoftEventStatus(event),
      organizer: event.organizer?.emailAddress
        ? {
            email: event.organizer.emailAddress.address || "",
            name: event.organizer.emailAddress.name ?? undefined,
          }
        : undefined,
      eventUrl: event.webLink ?? undefined,
      videoConferenceLink,
      recurrence,
      recurringEventId: event.seriesMasterId ?? undefined,
    };
  }

  private mapMicrosoftResponseStatus(
    status: string | undefined,
  ): AttendeeResponseStatus {
    switch (status?.toLowerCase()) {
      case "accepted":
        return "accepted";
      case "declined":
        return "declined";
      case "tentativelyaccepted":
      case "tentative":
        return "tentative";
      default:
        return "needsAction";
    }
  }

  private mapMicrosoftEventStatus(
    event: MicrosoftEvent,
  ): CalendarEventStatus | undefined {
    if (event.isCancelled) {
      return "cancelled";
    }
    switch (event.showAs?.toLowerCase()) {
      case "tentative":
        return "tentative";
      case "busy":
      case "oof":
      case "workingelsewhere":
        return "confirmed";
      default:
        return "confirmed";
    }
  }

  // parse RRULE string to Microsoft recurrence pattern (basic support)
  private parseRRuleToMicrosoft(
    rrule: string,
  ): { pattern: object; range: object } | null {
    if (!rrule.startsWith("RRULE:")) {
      return null;
    }

    const parts = rrule.slice(6).split(";");
    const params: Record<string, string> = {};
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key && value) {
        params[key] = value;
      }
    }

    const pattern: Record<string, unknown> = {};
    const range: Record<string, unknown> = { type: "noEnd" };

    // map FREQ to Microsoft pattern type
    switch (params.FREQ) {
      case "DAILY":
        pattern.type = "daily";
        pattern.interval = Number.parseInt(params.INTERVAL || "1", 10);
        break;
      case "WEEKLY":
        pattern.type = "weekly";
        pattern.interval = Number.parseInt(params.INTERVAL || "1", 10);
        if (params.BYDAY) {
          pattern.daysOfWeek = params.BYDAY.split(",").map((d) =>
            this.mapDayToMicrosoft(d),
          );
        }
        break;
      case "MONTHLY":
        pattern.type = "absoluteMonthly";
        pattern.interval = Number.parseInt(params.INTERVAL || "1", 10);
        if (params.BYMONTHDAY) {
          pattern.dayOfMonth = Number.parseInt(params.BYMONTHDAY, 10);
        }
        break;
      case "YEARLY":
        pattern.type = "absoluteYearly";
        pattern.interval = Number.parseInt(params.INTERVAL || "1", 10);
        break;
      default:
        return null;
    }

    // handle COUNT or UNTIL
    if (params.COUNT) {
      range.type = "numbered";
      range.numberOfOccurrences = Number.parseInt(params.COUNT, 10);
    } else if (params.UNTIL) {
      range.type = "endDate";
      range.endDate = params.UNTIL.slice(0, 10); // YYYYMMDD -> YYYY-MM-DD
    }

    return { pattern, range };
  }

  // convert Microsoft recurrence to RRULE format (basic support)
  private microsoftRecurrenceToRRule(recurrence: {
    pattern?: { type?: string; interval?: number; daysOfWeek?: string[] };
    range?: { type?: string; startDate?: string; endDate?: string };
  }): string {
    const parts: string[] = [];

    if (recurrence.pattern?.type) {
      switch (recurrence.pattern.type) {
        case "daily":
          parts.push("FREQ=DAILY");
          break;
        case "weekly":
          parts.push("FREQ=WEEKLY");
          if (recurrence.pattern.daysOfWeek) {
            const days = recurrence.pattern.daysOfWeek
              .map((d) => this.mapDayFromMicrosoft(d))
              .join(",");
            parts.push(`BYDAY=${days}`);
          }
          break;
        case "absoluteMonthly":
        case "relativeMonthly":
          parts.push("FREQ=MONTHLY");
          break;
        case "absoluteYearly":
        case "relativeYearly":
          parts.push("FREQ=YEARLY");
          break;
        default:
          // unknown recurrence type, skip frequency
          break;
      }
    }

    if (recurrence.pattern?.interval && recurrence.pattern.interval > 1) {
      parts.push(`INTERVAL=${recurrence.pattern.interval}`);
    }

    if (recurrence.range?.type === "endDate" && recurrence.range.endDate) {
      parts.push(`UNTIL=${recurrence.range.endDate.replace(/-/g, "")}`);
    }

    return `RRULE:${parts.join(";")}`;
  }

  private mapDayToMicrosoft(day: string): string {
    const map: Record<string, string> = {
      SU: "sunday",
      MO: "monday",
      TU: "tuesday",
      WE: "wednesday",
      TH: "thursday",
      FR: "friday",
      SA: "saturday",
    };
    return map[day] || day.toLowerCase();
  }

  private mapDayFromMicrosoft(day: string): string {
    const map: Record<string, string> = {
      sunday: "SU",
      monday: "MO",
      tuesday: "TU",
      wednesday: "WE",
      thursday: "TH",
      friday: "FR",
      saturday: "SA",
    };
    return map[day.toLowerCase()] || day.slice(0, 2).toUpperCase();
  }
}

// -----------------------------------------------------------------------------
// Calendar Context Factory
// -----------------------------------------------------------------------------

export interface CreatePluginCalendarOptions {
  emailAccountId: string;
  provider: "google" | "microsoft";
  calendarPermissions: string[];
  capabilities: PluginCapability[];
}

/**
 * Creates a PluginCalendar instance scoped to the user's permissions.
 * Only provides read/write methods if those permissions are declared.
 */
export async function createPluginCalendar(
  options: CreatePluginCalendarOptions,
): Promise<PluginCalendar> {
  const { emailAccountId, provider, calendarPermissions, capabilities } =
    options;

  const hasReadPermission =
    calendarPermissions.includes("read") ||
    capabilities.includes("calendar:read") ||
    capabilities.includes("calendar:list");
  const hasWritePermission =
    calendarPermissions.includes("write") ||
    capabilities.includes("calendar:write");

  // fetch calendar connection from database
  const connection = await prisma.calendarConnection.findFirst({
    where: {
      emailAccountId,
      provider,
      isConnected: true,
    },
    select: {
      id: true,
      provider: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      calendars: {
        select: {
          id: true,
          calendarId: true,
          name: true,
          description: true,
          timezone: true,
          isEnabled: true,
        },
      },
    },
  });

  // create appropriate adapter based on provider
  const adapter = createCalendarAdapter(connection, emailAccountId, provider);

  return {
    async listCalendars(): Promise<Calendar[]> {
      if (!hasReadPermission) {
        logger.warn("Plugin attempted to list calendars without permission", {
          emailAccountId,
        });
        return [];
      }

      if (!adapter) {
        throw new Error(
          "Calendar not connected. User must connect their calendar in Settings before plugins can access it.",
        );
      }

      try {
        return await adapter.listCalendars();
      } catch (error) {
        logger.error("Failed to list calendars", {
          emailAccountId,
          provider,
          error,
        });
        return [];
      }
    },

    async listEvents(listOptions: ListEventsOptions): Promise<CalendarEvent[]> {
      if (!hasReadPermission) {
        logger.warn("Plugin attempted to list events without permission", {
          emailAccountId,
        });
        return [];
      }

      if (!adapter) {
        throw new Error(
          "Calendar not connected. User must connect their calendar in Settings before plugins can access it.",
        );
      }

      try {
        return await adapter.listEvents(listOptions);
      } catch (error) {
        logger.error("Failed to list events", {
          emailAccountId,
          provider,
          error,
        });
        return [];
      }
    },

    async getEvent(
      eventId: string,
      calendarId?: string,
    ): Promise<CalendarEvent> {
      if (!hasReadPermission) {
        throw new PluginCapabilityError(
          "calendar:read",
          "ctx.calendar.getEvent()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      return adapter.getEvent(eventId, calendarId);
    },

    async getBusyPeriods(
      busyOptions: GetBusyPeriodsOptions,
    ): Promise<BusyPeriod[]> {
      if (!hasReadPermission) {
        throw new PluginCapabilityError(
          "calendar:read",
          "ctx.calendar.getBusyPeriods()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      logger.info("Plugin fetching busy periods", {
        emailAccountId,
        provider,
        timeMin: busyOptions.timeMin.toISOString(),
        timeMax: busyOptions.timeMax.toISOString(),
      });

      return adapter.getBusyPeriods(busyOptions);
    },

    async listEventsWithAttendee(
      attendeeOptions: ListEventsWithAttendeeOptions,
    ): Promise<CalendarEvent[]> {
      if (!hasReadPermission) {
        throw new PluginCapabilityError(
          "calendar:read",
          "ctx.calendar.listEventsWithAttendee()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      logger.info("Plugin listing events with attendee", {
        emailAccountId,
        provider,
        attendeeEmail: attendeeOptions.attendeeEmail,
      });

      return adapter.listEventsWithAttendee(attendeeOptions);
    },

    async createEvent(
      event: CreateEventInput,
      calendarId?: string,
    ): Promise<CalendarEvent> {
      if (!hasWritePermission) {
        throw new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.createEvent()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      logger.info("Plugin creating calendar event", {
        emailAccountId,
        provider,
        summary: event.summary,
        calendarId,
      });

      return adapter.createEvent(event, calendarId);
    },

    async updateEvent(
      eventId: string,
      event: UpdateEventInput,
      calendarId?: string,
    ): Promise<CalendarEvent> {
      if (!hasWritePermission) {
        throw new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.updateEvent()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      logger.info("Plugin updating calendar event", {
        emailAccountId,
        provider,
        eventId,
        calendarId,
      });

      return adapter.updateEvent(eventId, event, calendarId);
    },

    async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
      if (!hasWritePermission) {
        throw new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.deleteEvent()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      logger.info("Plugin deleting calendar event", {
        emailAccountId,
        provider,
        eventId,
        calendarId,
      });

      return adapter.deleteEvent(eventId, calendarId);
    },

    async respondToEvent(
      eventId: string,
      input: RespondToEventInput,
      calendarId?: string,
    ): Promise<void> {
      if (!hasWritePermission) {
        throw new PluginCapabilityError(
          "calendar:write",
          "ctx.calendar.respondToEvent()",
        );
      }

      if (!adapter) {
        throw new Error("No calendar connection available");
      }

      logger.info("Plugin responding to calendar event", {
        emailAccountId,
        provider,
        eventId,
        response: input.response,
        calendarId,
      });

      return adapter.respondToEvent(eventId, input, calendarId);
    },
  };
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

interface CalendarAdapter {
  listCalendars(): Promise<Calendar[]>;
  listEvents(options: ListEventsOptions): Promise<CalendarEvent[]>;
  getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent>;
  getBusyPeriods(options: GetBusyPeriodsOptions): Promise<BusyPeriod[]>;
  listEventsWithAttendee(
    options: ListEventsWithAttendeeOptions,
  ): Promise<CalendarEvent[]>;
  createEvent(
    event: CreateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent>;
  updateEvent(
    eventId: string,
    event: UpdateEventInput,
    calendarId?: string,
  ): Promise<CalendarEvent>;
  deleteEvent(eventId: string, calendarId?: string): Promise<void>;
  respondToEvent(
    eventId: string,
    input: RespondToEventInput,
    calendarId?: string,
  ): Promise<void>;
}

function createCalendarAdapter(
  connection: CalendarConnection | null,
  emailAccountId: string,
  provider: "google" | "microsoft",
): CalendarAdapter | null {
  if (!connection || !connection.refreshToken) {
    return null;
  }

  const connectionParams: CalendarConnectionParams = {
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt?.getTime() ?? null,
    emailAccountId,
  };

  if (provider === "google") {
    return new GoogleCalendarAdapter(connectionParams, logger);
  } else if (provider === "microsoft") {
    return new MicrosoftCalendarAdapter(connectionParams, logger);
  }

  return null;
}

/**
 * Creates a throwing PluginCalendar for when no calendar capability is declared.
 * All operations throw PluginCapabilityError with clear guidance.
 */
export function createNoOpPluginCalendar(): PluginCalendar {
  return {
    async listCalendars(): Promise<Calendar[]> {
      throw new PluginCapabilityError(
        "calendar:list",
        "ctx.calendar.listCalendars()",
      );
    },
    async listEvents(): Promise<CalendarEvent[]> {
      throw new PluginCapabilityError(
        "calendar:read",
        "ctx.calendar.listEvents()",
      );
    },
    async getEvent(): Promise<CalendarEvent> {
      throw new PluginCapabilityError(
        "calendar:read",
        "ctx.calendar.getEvent()",
      );
    },
    async getBusyPeriods(): Promise<BusyPeriod[]> {
      throw new PluginCapabilityError(
        "calendar:read",
        "ctx.calendar.getBusyPeriods()",
      );
    },
    async listEventsWithAttendee(): Promise<CalendarEvent[]> {
      throw new PluginCapabilityError(
        "calendar:read",
        "ctx.calendar.listEventsWithAttendee()",
      );
    },
    async createEvent(): Promise<CalendarEvent> {
      throw new PluginCapabilityError(
        "calendar:write",
        "ctx.calendar.createEvent()",
      );
    },
    async updateEvent(): Promise<CalendarEvent> {
      throw new PluginCapabilityError(
        "calendar:write",
        "ctx.calendar.updateEvent()",
      );
    },
    async deleteEvent(): Promise<void> {
      throw new PluginCapabilityError(
        "calendar:write",
        "ctx.calendar.deleteEvent()",
      );
    },
    async respondToEvent(): Promise<void> {
      throw new PluginCapabilityError(
        "calendar:write",
        "ctx.calendar.respondToEvent()",
      );
    },
  };
}
