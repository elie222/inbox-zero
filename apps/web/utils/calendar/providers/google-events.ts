import type {
  CalendarInvitation,
  InvitationResponse,
  InvitationEvent,
} from "@/utils/calendar/invitations/parser";
import { SafeError } from "@/utils/error";
import type { calendar_v3 } from "@googleapis/calendar";
import { randomUUID } from "node:crypto";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { getCalendarClientWithRefresh } from "@/utils/calendar/client";
import type {
  CalendarEvent,
  CalendarEventCancelInput,
  CalendarEventProvider,
  CalendarEventUpdateInput,
  CalendarEventWriteInput,
  CalendarEventWriteResult,
} from "@/utils/calendar/event-types";
import { findVideoConferenceLink } from "@/utils/calendar/video-conference-link";
import type { Logger } from "@/utils/logger";

export interface GoogleCalendarConnectionParams {
  accessToken: string | null;
  connectionId: string;
  emailAccountId: string;
  expiresAt: number | null;
  refreshToken: string | null;
}

export class GoogleCalendarEventProvider implements CalendarEventProvider {
  private readonly connection: GoogleCalendarConnectionParams;
  private readonly logger: Logger;

  constructor(connection: GoogleCalendarConnectionParams, logger: Logger) {
    this.connection = connection;
    this.logger = logger;
  }

  private async getClient(): Promise<calendar_v3.Calendar> {
    return getCalendarClientWithRefresh({
      accessToken: this.connection.accessToken,
      refreshToken: this.connection.refreshToken,
      expiresAt: this.connection.expiresAt,
      emailAccountId: this.connection.emailAccountId,
      connectionId: this.connection.connectionId,
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
    this.logger.info("Starting Google calendar client setup");
    const client = await this.getClient();
    this.logger.info("Completed Google calendar client setup");

    this.logger.info("Starting Google calendar events request");
    const response = await client.events.list({
      calendarId: "primary",
      timeMin: timeMin?.toISOString(),
      timeMax: timeMax?.toISOString(),
      maxResults: maxResults || 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];
    this.logger.info("Completed Google calendar events request", {
      eventCount: events.length,
    });

    return events.map((event) => this.parseEvent(event));
  }

  async findInvitationEvent(
    invitation: CalendarInvitation,
  ): Promise<InvitationEvent | null> {
    // An exception must never accidentally update the whole recurring series.
    if (invitation.recurrenceId) return null;
    const client = await this.getClient();
    const { data } = await client.events.list({
      calendarId: "primary",
      iCalUID: invitation.uid,
      showDeleted: true,
      maxResults: 2,
    });
    const events = data.items ?? [];
    if (events.length !== 1 || data.nextPageToken) return null;
    const event = events[0];
    if (event.status === "cancelled")
      throw new SafeError("This event has been cancelled.");
    if (
      !event.id ||
      event.organizer?.self ||
      event.organizer?.email?.toLowerCase() !== invitation.organizer
    )
      return null;
    const attendee = event.attendees?.find(
      (attendee) =>
        attendee.self && attendee.email?.toLowerCase() === invitation.attendee,
    );
    if (!attendee) return null;
    if ((event.sequence ?? 0) !== invitation.sequence)
      throw new SafeError(
        "This invitation has changed. Please respond to the latest invitation in your calendar.",
      );
    return { id: event.id, response: attendee.responseStatus ?? null };
  }

  async respondToInvitation(
    eventId: string,
    invitation: CalendarInvitation,
    response: InvitationResponse,
  ) {
    const client = await this.getClient();
    await client.events.patch({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
      requestBody: {
        attendeesOmitted: true,
        attendees: [{ email: invitation.attendee, responseStatus: response }],
      },
    });
  }

  async createEvent(
    input: CalendarEventWriteInput,
  ): Promise<CalendarEventWriteResult> {
    const client = await this.getClient();
    const useGoogleMeet =
      input.locationType === BookingLinkLocationType.GOOGLE_MEET;

    const response = await client.events.insert({
      calendarId: input.calendarId,
      conferenceDataVersion: useGoogleMeet ? 1 : undefined,
      sendUpdates: "all",
      requestBody: {
        summary: input.title,
        description: input.description,
        location: useGoogleMeet ? undefined : input.locationValue || undefined,
        start: {
          dateTime: input.startTime.toISOString(),
          timeZone: input.timezone,
        },
        end: {
          dateTime: input.endTime.toISOString(),
          timeZone: input.timezone,
        },
        attendees: input.attendees.map((attendee) => ({
          email: attendee.email,
          displayName: attendee.name,
        })),
        conferenceData: useGoogleMeet
          ? {
              createRequest: {
                requestId: randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
      },
    });

    return {
      id: response.data.id || "",
      providerCalendarId: input.calendarId,
      eventUrl: response.data.htmlLink || undefined,
      videoConferenceLink:
        response.data.hangoutLink ||
        response.data.conferenceData?.entryPoints?.find(
          (entry) => entry.entryPointType === "video",
        )?.uri ||
        undefined,
    };
  }

  async cancelEvent(input: CalendarEventCancelInput): Promise<void> {
    const client = await this.getClient();

    await client.events.delete({
      calendarId: input.calendarId,
      eventId: input.eventId,
      sendUpdates: "all",
    });
  }

  async updateEvent(input: CalendarEventUpdateInput): Promise<void> {
    const client = await this.getClient();

    await client.events.patch({
      calendarId: input.calendarId,
      eventId: input.eventId,
      sendUpdates: "all",
      requestBody: {
        start: {
          dateTime: input.startTime.toISOString(),
          timeZone: input.timezone,
        },
        end: {
          dateTime: input.endTime.toISOString(),
          timeZone: input.timezone,
        },
      },
    });
  }

  private parseEvent(event: calendar_v3.Schema$Event) {
    const startTime = new Date(
      event.start?.dateTime || event.start?.date || Date.now(),
    );
    const endTime = new Date(
      event.end?.dateTime || event.end?.date || Date.now(),
    );

    let videoConferenceLink = event.hangoutLink ?? undefined;
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find(
        (entry) => entry.entryPointType === "video",
      );
      videoConferenceLink = videoEntry?.uri ?? videoConferenceLink;
    }
    videoConferenceLink ??= findVideoConferenceLink(
      event.location,
      event.description,
    );

    return {
      id: event.id || "",
      title: event.summary || "Untitled",
      description: event.description || undefined,
      location: event.location || undefined,
      eventUrl: event.htmlLink || undefined,
      videoConferenceLink,
      startTime,
      endTime,
      organizerEmail: event.organizer?.email ?? undefined,
      isOrganizer: event.organizer?.self ?? undefined,
      attendees:
        event.attendees?.map((attendee) => ({
          email: attendee.email || "",
          name: attendee.displayName ?? undefined,
          declined: attendee.responseStatus === "declined",
        })) || [],
    };
  }
}
