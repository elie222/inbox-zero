import { createScopedLogger } from "@/utils/logger";
import type { MeetingLinkResult } from "./types";

const logger = createScopedLogger("meetings/providers/google-meet");

export interface GoogleMeetMeetingOptions {
  emailAccountId: string;
  subject: string;
  startDateTime: Date;
  endDateTime: string;
}

/**
 * Create Google Meet conference data for calendar event
 * Google Meet links are created automatically when adding conferenceData to calendar events
 * No separate API call needed - Google Calendar creates the Meet link
 */
export function createGoogleMeetConferenceData(
  options: GoogleMeetMeetingOptions,
): MeetingLinkResult {
  const { emailAccountId, subject } = options;

  logger.info("Creating Google Meet conference data", {
    emailAccountId,
    subject,
  });

  // Google Calendar will automatically create a Meet link when this conference data is included
  const requestId = crypto.randomUUID();

  logger.info("Google Meet conference data created", {
    requestId,
  });

  return {
    provider: "google-meet",
    joinUrl: "", // Will be populated by Google Calendar after event creation
    conferenceId: requestId,
    conferenceData: {
      // Data to attach to Google Calendar event
      // https://developers.google.com/calendar/api/v3/reference/events#conferenceData
      createRequest: {
        requestId,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    },
  };
}
