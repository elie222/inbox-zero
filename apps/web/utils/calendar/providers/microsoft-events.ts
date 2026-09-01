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
import { findVideoConferenceLink } from "@/utils/calendar/video-conference-link";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const ONLINE_MEETING_JOIN_URL_POLL_DELAYS_MS = [500, 1000, 2000] as const;
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
  body?: { content?: string };
  bodyPreview?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
    status?: { response?: string };
  }>;
  isOrganizer?: boolean;
  organizer?: { emailAddress?: { address?: string; name?: string } };
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
  onlineMeetingProvider: string;
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
      ? await getOnlineMeetingFields({
          calendarId: input.calendarId,
          client,
          logger: this.logger,
        })
      : null;
    const requestedOnlineMeeting = Boolean(onlineMeetingFields);
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
          !useMicrosoftTeams && input.locationValue
            ? { displayName: input.locationValue }
            : undefined,
      });

    let videoConferenceLink = getJoinUrl(response);

    // Graph initializes the online meeting after the event is created, so the
    // POST response sometimes returns before `onlineMeeting` is populated.
    // Refetch the event to retrieve the join URL when one was requested.
    if (requestedOnlineMeeting && !videoConferenceLink && response.id) {
      videoConferenceLink = await pollForOnlineMeetingJoinUrl({
        client,
        eventId: response.id,
        logger: this.logger,
      });
    }

    if (requestedOnlineMeeting && !videoConferenceLink && response.id) {
      try {
        const patched: MicrosoftEvent = await client
          .api(`/me/events/${response.id}`)
          .patch(onlineMeetingFields);
        videoConferenceLink = getJoinUrl(patched);
      } catch (error) {
        this.logger.warn("Failed to enable online meeting on Microsoft event", {
          eventId: response.id,
          error,
        });
      }
    }

    if (requestedOnlineMeeting && !videoConferenceLink && response.id) {
      videoConferenceLink = await pollForOnlineMeetingJoinUrl({
        client,
        eventId: response.id,
        logger: this.logger,
      });
    }

    if (requestedOnlineMeeting && !videoConferenceLink) {
      this.logger.warn(
        "Microsoft online meeting link missing after event creation",
        {
          eventId: response.id,
          isOnlineMeeting: response.isOnlineMeeting,
          onlineMeetingProvider: response.onlineMeetingProvider,
        },
      );
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
      videoConferenceLink:
        getJoinUrl(event) ||
        findVideoConferenceLink(
          event.location?.displayName,
          event.body?.content ?? event.bodyPreview,
        ),
      startTime: new Date(event.start?.dateTime || Date.now()),
      endTime: new Date(event.end?.dateTime || Date.now()),
      organizerEmail: event.organizer?.emailAddress?.address || undefined,
      isOrganizer: event.isOrganizer,
      attendees:
        event.attendees?.map((attendee) => ({
          email: attendee.emailAddress?.address || "",
          name: attendee.emailAddress?.name ?? undefined,
          declined: attendee.status?.response === "declined",
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

async function getOnlineMeetingFields({
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

  let onlineMeetingProvider = settings?.defaultOnlineMeetingProvider;
  if (
    !settings ||
    settings.allowedOnlineMeetingProviders?.includes(MICROSOFT_TEAMS_PROVIDER)
  ) {
    onlineMeetingProvider = MICROSOFT_TEAMS_PROVIDER;
  }

  // Personal Outlook calendars advertise Skype but ignore meeting fields.
  if (
    !onlineMeetingProvider ||
    onlineMeetingProvider === "skypeForConsumer" ||
    onlineMeetingProvider === "unknown"
  ) {
    logger.warn("Calendar cannot generate an online meeting link", {
      calendarId,
      onlineMeetingProvider,
      allowedOnlineMeetingProviders: settings?.allowedOnlineMeetingProviders,
      defaultOnlineMeetingProvider: settings?.defaultOnlineMeetingProvider,
    });
    return null;
  }

  return {
    isOnlineMeeting: true,
    onlineMeetingProvider,
  } satisfies MicrosoftOnlineMeetingFields;
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

async function pollForOnlineMeetingJoinUrl({
  client,
  eventId,
  logger,
}: {
  client: Client;
  eventId: string;
  logger: Logger;
}) {
  for (const delayMs of [0, ...ONLINE_MEETING_JOIN_URL_POLL_DELAYS_MS]) {
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
      logger.warn("Failed to refetch Microsoft event for online meeting URL", {
        eventId,
        error,
      });
    }
  }

  return;
}
