import type { Client } from "@microsoft/microsoft-graph-client";
import { getCalendarClientWithRefresh } from "@/utils/outlook/calendar-client";
import type {
  CalendarEvent,
  CalendarEventCancelInput,
  CalendarEventProvider,
  CalendarEventUpdateInput,
  CalendarEventWriteInput,
  CalendarEventWriteResult,
} from "@/utils/calendar/event-types";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";

const TEAMS_JOIN_URL_POLL_DELAYS_MS = [500, 1000, 2000] as const;
const MICROSOFT_TEAMS_PROVIDER = "teamsForBusiness";

export interface MicrosoftCalendarConnectionParams {
  accessToken: string | null;
  emailAccountId: string;
  expiresAt: number | null;
  refreshToken: string | null;
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
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
};

type MicrosoftCalendarOnlineMeetingSettings = {
  allowedOnlineMeetingProviders?: string[];
  defaultOnlineMeetingProvider?: string;
};

type MicrosoftOnlineMeetingFields = {
  isOnlineMeeting: true;
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

  async createEvent(
    input: CalendarEventWriteInput,
  ): Promise<CalendarEventWriteResult> {
    const client = await this.getClient();
    const useMicrosoftTeams =
      input.locationType === BookingLinkLocationType.MICROSOFT_TEAMS;
    const onlineMeetingFields = useMicrosoftTeams
      ? await getTeamsOnlineMeetingFields({
          calendarId: input.calendarId,
          client,
          logger: this.logger,
        })
      : null;
    const requestedMicrosoftTeams = Boolean(onlineMeetingFields);
    const response: MicrosoftEvent = await client
      .api(`/me/calendars/${input.calendarId}/events`)
      .post({
        subject: input.title,
        body: {
          contentType: "text",
          content: input.description || "",
        },
        start: {
          dateTime: formatMicrosoftUtcDateTime(input.startTime),
          timeZone: "UTC",
        },
        end: {
          dateTime: formatMicrosoftUtcDateTime(input.endTime),
          timeZone: "UTC",
        },
        attendees: input.attendees.map((attendee) => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name || attendee.email,
          },
          type: "required",
        })),
        ...(onlineMeetingFields ?? {}),
        location:
          !requestedMicrosoftTeams && input.locationValue
            ? { displayName: input.locationValue }
            : undefined,
      });

    let videoConferenceLink = getJoinUrl(response);

    // Graph initializes the Teams meeting after the event is created, so the
    // POST response sometimes returns before `onlineMeeting` is populated.
    // Refetch the event to retrieve the join URL when we asked for Teams.
    if (requestedMicrosoftTeams && !videoConferenceLink && response.id) {
      videoConferenceLink = await pollForTeamsJoinUrl({
        client,
        eventId: response.id,
        logger: this.logger,
      });
    }

    if (requestedMicrosoftTeams && !videoConferenceLink && response.id) {
      try {
        const patched: MicrosoftEvent = await client
          .api(`/me/events/${response.id}`)
          .patch({
            isOnlineMeeting: true,
          });
        videoConferenceLink = getJoinUrl(patched);
      } catch (error) {
        this.logger.warn("Failed to enable Microsoft Teams on event", {
          eventId: response.id,
          error,
        });
      }
    }

    if (requestedMicrosoftTeams && !videoConferenceLink && response.id) {
      videoConferenceLink = await pollForTeamsJoinUrl({
        client,
        eventId: response.id,
        logger: this.logger,
      });
    }

    if (requestedMicrosoftTeams && !videoConferenceLink) {
      this.logger.warn("Microsoft Teams link missing after event creation", {
        eventId: response.id,
        isOnlineMeeting: response.isOnlineMeeting,
        onlineMeetingProvider: response.onlineMeetingProvider,
      });
    }

    return {
      id: response.id || "",
      providerCalendarId: input.calendarId,
      eventUrl: response.webLink,
      videoConferenceLink,
    };
  }

  async cancelEvent(input: CalendarEventCancelInput): Promise<void> {
    const client = await this.getClient();

    await client
      .api(`/me/events/${input.eventId}/cancel`)
      .post({ comment: "" });
  }

  async updateEvent(input: CalendarEventUpdateInput): Promise<void> {
    const client = await this.getClient();

    await client.api(`/me/events/${input.eventId}`).patch({
      start: {
        dateTime: formatMicrosoftUtcDateTime(input.startTime),
        timeZone: "UTC",
      },
      end: {
        dateTime: formatMicrosoftUtcDateTime(input.endTime),
        timeZone: "UTC",
      },
    });
  }

  private parseEvent(event: MicrosoftEvent) {
    return {
      id: event.id || "",
      title: event.subject || "Untitled",
      description: event.bodyPreview || undefined,
      location: event.location?.displayName || undefined,
      eventUrl: event.webLink || undefined,
      videoConferenceLink: getJoinUrl(event),
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

function formatMicrosoftUtcDateTime(date: Date) {
  // Graph DateTimeTimeZone expects a local datetime for the supplied timezone.
  return date.toISOString().replace(/Z$/, "0000");
}

function getJoinUrl(event: MicrosoftEvent): string | undefined {
  return event.onlineMeeting?.joinUrl || event.onlineMeetingUrl;
}

async function getTeamsOnlineMeetingFields({
  calendarId,
  client,
  logger,
}: {
  calendarId: string;
  client: Client;
  logger: Logger;
}) {
  const settings = await getCalendarOnlineMeetingSettings({
    calendarId,
    client,
    logger,
  });

  if (
    settings?.allowedOnlineMeetingProviders &&
    !settings.allowedOnlineMeetingProviders.includes(MICROSOFT_TEAMS_PROVIDER)
  ) {
    logger.warn("Microsoft Teams meetings are not supported for calendar", {
      calendarId,
      allowedOnlineMeetingProviders: settings.allowedOnlineMeetingProviders,
      defaultOnlineMeetingProvider: settings.defaultOnlineMeetingProvider,
    });
    return null;
  }

  if (
    settings?.defaultOnlineMeetingProvider &&
    settings.defaultOnlineMeetingProvider !== MICROSOFT_TEAMS_PROVIDER
  ) {
    logger.warn(
      "Microsoft Teams is not the default online meeting provider for calendar",
      {
        calendarId,
        allowedOnlineMeetingProviders: settings.allowedOnlineMeetingProviders,
        defaultOnlineMeetingProvider: settings.defaultOnlineMeetingProvider,
      },
    );
    return null;
  }

  // Graph can ignore explicit teamsForBusiness on some Outlook calendars and
  // create a regular event instead, so let the calendar's online provider
  // settings drive Teams generation.
  return { isOnlineMeeting: true } satisfies MicrosoftOnlineMeetingFields;
}

async function getCalendarOnlineMeetingSettings({
  calendarId,
  client,
  logger,
}: {
  calendarId: string;
  client: Client;
  logger: Logger;
}): Promise<MicrosoftCalendarOnlineMeetingSettings | null> {
  try {
    return await client
      .api(`/me/calendars/${calendarId}`)
      .select("id,allowedOnlineMeetingProviders,defaultOnlineMeetingProvider")
      .get();
  } catch (error) {
    logger.warn("Failed to fetch Microsoft calendar meeting providers", {
      calendarId,
      error,
    });
    return null;
  }
}

async function pollForTeamsJoinUrl({
  client,
  eventId,
  logger,
}: {
  client: Client;
  eventId: string;
  logger: Logger;
}) {
  for (const delayMs of [0, ...TEAMS_JOIN_URL_POLL_DELAYS_MS]) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const event: MicrosoftEvent | undefined = await client
        .api(`/me/events/${eventId}`)
        .get();
      if (!event) continue;

      const joinUrl = getJoinUrl(event);
      if (joinUrl) return joinUrl;

      if (
        event.isOnlineMeeting === false &&
        event.onlineMeetingProvider === "unknown"
      ) {
        return;
      }
    } catch (error) {
      logger.warn("Failed to refetch Microsoft event for Teams join URL", {
        eventId,
        error,
      });
    }
  }

  return;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
