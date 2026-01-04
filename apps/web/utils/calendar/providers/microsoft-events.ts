import type { Client } from "@microsoft/microsoft-graph-client";
import { getCalendarClientWithRefresh } from "@/utils/outlook/calendar-client";
import type {
  CalendarEvent,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";

export interface MicrosoftCalendarConnectionParams {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}

type MicrosoftEvent = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
  }>;
  location?: { displayName?: string };
  webLink?: string;
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
};

export class MicrosoftCalendarEventProvider implements CalendarEventProvider {
  private readonly connection: MicrosoftCalendarConnectionParams;
  private readonly logger: Logger;

  constructor(connection: MicrosoftCalendarConnectionParams, logger: Logger) {
    this.connection = connection;
    this.logger = logger;
  }

  private async getClient(): Promise<Client> {
    return getCalendarClientWithRefresh({
      accessToken: this.connection.accessToken,
      refreshToken: this.connection.refreshToken,
      expiresAt: this.connection.expiresAt,
      emailAccountId: this.connection.emailAccountId,
      logger: this.logger,
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

    // Use calendarView endpoint which correctly returns events overlapping the time range
    const response = await client
      .api("/me/calendar/calendarView")
      .query({
        startDateTime: timeMin.toISOString(),
        endDateTime: timeMax.toISOString(),
      })
      .top(maxResults * 3) // Fetch more to filter by attendee
      .orderby("start/dateTime")
      .get();

    const events: MicrosoftEvent[] = response.value || [];

    // Filter to events that have this attendee
    return events
      .filter((event) =>
        event.attendees?.some(
          (a) =>
            a.emailAddress?.address?.toLowerCase() ===
            attendeeEmail.toLowerCase(),
        ),
      )
      .slice(0, maxResults)
      .map((event) => this.parseEvent(event));
  }

  async fetchEvents({
    timeMin = new Date(),
    timeMax,
    maxResults,
  }: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }): Promise<CalendarEvent[]> {
    const client = await this.getClient();

    // calendarView requires both start and end times, default to 30 days from timeMin
    const effectiveTimeMax =
      timeMax ?? new Date(timeMin.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Use calendarView endpoint which correctly returns events overlapping the time range
    const response = await client
      .api("/me/calendar/calendarView")
      .query({
        startDateTime: timeMin.toISOString(),
        endDateTime: effectiveTimeMax.toISOString(),
      })
      .top(maxResults || 100)
      .orderby("start/dateTime")
      .get();

    const events: MicrosoftEvent[] = response.value || [];

    return events.map((event) => this.parseEvent(event));
  }

  private parseEvent(event: MicrosoftEvent) {
    return {
      id: event.id || "",
      title: event.subject || "Untitled",
      description: event.bodyPreview || undefined,
      location: event.location?.displayName || undefined,
      eventUrl: event.webLink || undefined,
      videoConferenceLink:
        event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || undefined,
      startTime: new Date(event.start?.dateTime || Date.now()),
      endTime: new Date(event.end?.dateTime || Date.now()),
      attendees:
        event.attendees?.map((attendee) => ({
          email: attendee.emailAddress?.address || "",
          name: attendee.emailAddress?.name ?? undefined,
        })) || [],
    };
  }
}
