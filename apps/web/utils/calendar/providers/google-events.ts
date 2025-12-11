import type { calendar_v3 } from "@googleapis/calendar";
import { getCalendarClientWithRefresh } from "@/utils/calendar/client";
import type {
  CalendarEvent,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";

export interface GoogleCalendarConnectionParams {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}

export class GoogleCalendarEventProvider implements CalendarEventProvider {
  private readonly connection: GoogleCalendarConnectionParams;

  constructor(connection: GoogleCalendarConnectionParams) {
    this.connection = connection;
  }

  private async getClient(): Promise<calendar_v3.Calendar> {
    return getCalendarClientWithRefresh({
      accessToken: this.connection.accessToken,
      refreshToken: this.connection.refreshToken,
      expiresAt: this.connection.expiresAt,
      emailAccountId: this.connection.emailAccountId,
    });
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
  }): Promise<CalendarEvent[]> {
    const client = await this.getClient();

    const response = await client.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
      q: attendeeEmail,
    });

    const events = response.data.items || [];

    // Filter to events that actually have this attendee
    return events
      .filter((event) =>
        event.attendees?.some(
          (a) => a.email?.toLowerCase() === attendeeEmail.toLowerCase(),
        ),
      )
      .map((event) => ({
        id: event.id || "",
        title: event.summary || "Untitled",
        startTime: new Date(
          event.start?.dateTime || event.start?.date || Date.now(),
        ),
        endTime: new Date(event.end?.dateTime || event.end?.date || Date.now()),
        attendees:
          event.attendees?.map((a) => ({
            email: a.email || "",
            name: a.displayName ?? undefined,
          })) || [],
      }));
  }

  async fetchUpcomingEvents({
    timeMin,
    timeMax,
    maxResults,
  }: {
    timeMin: Date;
    timeMax: Date;
    maxResults: number;
  }): Promise<CalendarEvent[]> {
    const client = await this.getClient();

    const response = await client.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    return events.map((event) => ({
      id: event.id || "",
      title: event.summary || "Untitled",
      startTime: new Date(
        event.start?.dateTime || event.start?.date || Date.now(),
      ),
      endTime: new Date(event.end?.dateTime || event.end?.date || Date.now()),
      attendees:
        event.attendees?.map((a) => ({
          email: a.email || "",
          name: a.displayName ?? undefined,
        })) || [],
    }));
  }
}
