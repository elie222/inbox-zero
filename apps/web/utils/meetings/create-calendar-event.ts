import { createScopedLogger } from "@/utils/logger";
import { getCalendarClientWithRefresh as getGoogleCalendarClient } from "@/utils/calendar/client";
import { getCalendarClientWithRefresh as getOutlookCalendarClient } from "@/utils/outlook/calendar-client";
import type { MeetingLinkResult } from "@/utils/meetings/providers/types";
import type { ParsedMeetingRequest } from "@/utils/meetings/parse-meeting-request";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("meetings/create-calendar-event");

export interface CreateCalendarEventOptions {
  emailAccountId: string;
  meetingDetails: ParsedMeetingRequest;
  startDateTime: Date;
  endDateTime: string;
  meetingLink: MeetingLinkResult;
  timezone: string;
}

export interface CalendarEventResult {
  eventId: string;
  eventUrl: string;
  provider: "google" | "microsoft";
}

/**
 * Create a calendar event with meeting link
 *
 * This function:
 * 1. Determines the calendar provider (Google or Microsoft)
 * 2. Gets the calendar connection with OAuth tokens
 * 3. Creates the calendar event with attendees, time, and meeting link
 * 4. Returns the created event details
 */
export async function createCalendarEvent(
  options: CreateCalendarEventOptions,
): Promise<CalendarEventResult> {
  const {
    emailAccountId,
    meetingDetails,
    startDateTime,
    endDateTime,
    meetingLink,
    timezone,
  } = options;

  logger.info("Creating calendar event", {
    emailAccountId,
    title: meetingDetails.title,
    provider: meetingLink.provider,
  });

  // Get the email account to determine provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const isGoogle = emailAccount.account.provider === "google";

  // Get the calendar connection
  const calendarConnection = await prisma.calendarConnection.findFirst({
    where: {
      emailAccountId,
      provider: isGoogle ? "google" : "microsoft",
      isConnected: true,
    },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      calendars: {
        where: {
          isEnabled: true,
          primary: true,
        },
        select: {
          calendarId: true,
        },
        take: 1,
      },
    },
  });

  if (!calendarConnection) {
    throw new Error(
      `No connected ${isGoogle ? "Google" : "Microsoft"} calendar found`,
    );
  }

  if (!calendarConnection.accessToken || !calendarConnection.refreshToken) {
    throw new Error("Missing calendar authentication tokens");
  }

  // Get primary calendar or first enabled calendar
  const primaryCalendar = calendarConnection.calendars[0];
  const calendarId = primaryCalendar?.calendarId || "primary";

  logger.trace("Using calendar", { calendarId, isGoogle });

  // Extract tokens (we've already validated they're not null)
  const tokens = {
    accessToken: calendarConnection.accessToken,
    refreshToken: calendarConnection.refreshToken,
    expiresAt: calendarConnection.expiresAt,
  };

  // Create event based on provider
  if (isGoogle) {
    return createGoogleCalendarEvent({
      tokens,
      calendarId,
      meetingDetails,
      startDateTime,
      endDateTime,
      meetingLink,
      timezone,
      emailAccountId,
    });
  } else {
    return createMicrosoftCalendarEvent({
      tokens,
      calendarId,
      meetingDetails,
      startDateTime,
      endDateTime,
      meetingLink,
      timezone,
      emailAccountId,
    });
  }
}

/**
 * Create Google Calendar event
 */
async function createGoogleCalendarEvent({
  tokens,
  calendarId,
  meetingDetails,
  startDateTime,
  endDateTime,
  meetingLink,
  timezone,
  emailAccountId,
}: {
  tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: Date | null;
  };
  calendarId: string;
  meetingDetails: ParsedMeetingRequest;
  startDateTime: Date;
  endDateTime: string;
  meetingLink: MeetingLinkResult;
  timezone: string;
  emailAccountId: string;
}): Promise<CalendarEventResult> {
  const calendarClient = await getGoogleCalendarClient({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt?.getTime() || null,
    emailAccountId,
  });

  // Build event description
  let description = "";
  if (meetingDetails.agenda) {
    description += `${meetingDetails.agenda}\n\n`;
  }
  if (meetingDetails.notes) {
    description += `${meetingDetails.notes}\n\n`;
  }
  if (meetingLink.joinUrl) {
    description += `Join meeting: ${meetingLink.joinUrl}`;
  }

  // Build attendees list
  const attendees = meetingDetails.attendees.map((email) => ({
    email,
    responseStatus: "needsAction" as const,
  }));

  // Create the event with optional conferenceData
  const eventData: any = {
    summary: meetingDetails.title,
    description: description.trim() || undefined,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: timezone,
    },
    attendees,
    location: meetingDetails.location || undefined,
  };

  // Add conference data if available (Google Meet)
  if (meetingLink.conferenceData) {
    eventData.conferenceData = meetingLink.conferenceData;
  }

  try {
    const response = await calendarClient.events.insert({
      calendarId,
      requestBody: eventData,
      conferenceDataVersion: meetingLink.conferenceData ? 1 : undefined,
      sendUpdates: "all", // Send email invitations to attendees
    });

    logger.info("Google Calendar event created", {
      eventId: response.data.id,
      eventUrl: response.data.htmlLink,
    });

    return {
      eventId: response.data.id!,
      eventUrl: response.data.htmlLink!,
      provider: "google",
    };
  } catch (error) {
    logger.error("Failed to create Google Calendar event", { error });
    throw new Error(
      `Failed to create calendar event: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Create Microsoft Calendar event
 */
async function createMicrosoftCalendarEvent({
  tokens,
  calendarId,
  meetingDetails,
  startDateTime,
  endDateTime,
  meetingLink,
  timezone,
  emailAccountId,
}: {
  tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: Date | null;
  };
  calendarId: string;
  meetingDetails: ParsedMeetingRequest;
  startDateTime: Date;
  endDateTime: string;
  meetingLink: MeetingLinkResult;
  timezone: string;
  emailAccountId: string;
}): Promise<CalendarEventResult> {
  const calendarClient = await getOutlookCalendarClient({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt?.getTime() || null,
    emailAccountId,
  });

  // Build event body
  let bodyContent = "";
  if (meetingDetails.agenda) {
    bodyContent += `${meetingDetails.agenda}\n\n`;
  }
  if (meetingDetails.notes) {
    bodyContent += `${meetingDetails.notes}\n\n`;
  }
  if (meetingLink.joinUrl) {
    bodyContent += `Join meeting: ${meetingLink.joinUrl}`;
  }

  // Build attendees list
  const attendees = meetingDetails.attendees.map((email) => ({
    emailAddress: {
      address: email,
    },
    type: "required",
  }));

  // Create the event
  const eventData: any = {
    subject: meetingDetails.title,
    body: {
      contentType: "text",
      content: bodyContent.trim() || undefined,
    },
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: timezone,
    },
    attendees,
    location: meetingDetails.location
      ? {
          displayName: meetingDetails.location,
        }
      : undefined,
  };

  // Add Teams meeting data if available
  if (meetingLink.conferenceData) {
    eventData.isOnlineMeeting = true;
    eventData.onlineMeetingProvider = "teamsForBusiness";
    if (meetingLink.joinUrl) {
      eventData.onlineMeeting = {
        joinUrl: meetingLink.joinUrl,
      };
    }
  }

  try {
    const endpoint =
      calendarId === "primary"
        ? "/me/events"
        : `/me/calendars/${calendarId}/events`;

    const response = await calendarClient.api(endpoint).post(eventData);

    logger.info("Microsoft Calendar event created", {
      eventId: response.id,
      eventUrl: response.webLink,
    });

    return {
      eventId: response.id,
      eventUrl: response.webLink,
      provider: "microsoft",
    };
  } catch (error) {
    logger.error("Failed to create Microsoft Calendar event", { error });
    throw new Error(
      `Failed to create calendar event: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
