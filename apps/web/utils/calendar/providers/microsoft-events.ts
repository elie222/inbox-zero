import type { Client } from "@microsoft/microsoft-graph-client";
import { getCalendarClientWithRefresh } from "@/utils/outlook/calendar-client";
import type {
  CalendarEvent,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";

export interface MicrosoftCalendarConnectionParams {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}

export class MicrosoftCalendarEventProvider implements CalendarEventProvider {
  private readonly connection: MicrosoftCalendarConnectionParams;

  constructor(connection: MicrosoftCalendarConnectionParams) {
    this.connection = connection;
  }

  private async getClient(): Promise<Client> {
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

    const response = await client
      .api("/me/calendar/events")
      .filter(
        `start/dateTime ge '${timeMin.toISOString()}' and end/dateTime le '${timeMax.toISOString()}'`,
      )
      .top(maxResults * 3) // Fetch more to filter by attendee
      .orderby("start/dateTime")
      .get();

    const events = response.value || [];

    type MicrosoftEvent = {
      id?: string;
      subject?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      attendees?: Array<{
        emailAddress?: { address?: string; name?: string };
      }>;
    };

    // Filter to events that have this attendee
    return events
      .filter((event: MicrosoftEvent) =>
        event.attendees?.some(
          (a) =>
            a.emailAddress?.address?.toLowerCase() ===
            attendeeEmail.toLowerCase(),
        ),
      )
      .slice(0, maxResults)
      .map((event: MicrosoftEvent) => this.parseEvent(event));
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

    const filterParts = [
      timeMin ? `start/dateTime ge '${timeMin.toISOString()}'` : "",
      timeMax ? `end/dateTime le '${timeMax.toISOString()}'` : "",
    ].filter(Boolean);

    const response = await client
      .api("/me/calendar/events")
      .filter(filterParts.join(" and "))
      .top(maxResults || 100)
      .orderby("start/dateTime")
      .get();

    const events = response.value || [];

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

    return events.map((event: MicrosoftEvent) => this.parseEvent(event));
  }

  private parseEvent(event: {
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
  }) {
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
