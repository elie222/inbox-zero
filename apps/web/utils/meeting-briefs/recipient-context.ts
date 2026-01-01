import { addDays } from "date-fns/addDays";
import { subDays } from "date-fns/subDays";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import { formatInUserTimezone } from "@/utils/date";

const RECENT_MEETING_LOOKBACK_DAYS = 14;
const UPCOMING_MEETING_LOOKAHEAD_DAYS = 7;
const MAX_MEETINGS_PER_CATEGORY = 5;
const MAX_DESCRIPTION_LENGTH = 500;

export interface MeetingContext {
  eventTitle: string;
  eventTime: Date;
  eventDescription?: string;
  eventLocation?: string;
  isPast: boolean;
}

/**
 * Checks if all required emails are attendees of the event.
 */
function allRecipientsAreAttendees(
  event: CalendarEvent,
  requiredEmails: string[],
): boolean {
  const attendeeEmails = new Set(
    event.attendees.map((a) => a.email.toLowerCase()),
  );
  return requiredEmails.every((email) => attendeeEmails.has(email));
}

/**
 * Fetches meeting context for a specific recipient.
 * Includes both recent past meetings and upcoming meetings.
 * Used to provide cross-context awareness when drafting emails.
 *
 * Privacy: When additionalRecipients are provided (e.g., CC recipients),
 * only meetings where ALL recipients were attendees are included.
 * This prevents leaking private calendar information to people who
 * weren't part of those meetings.
 */
export async function getMeetingContext({
  emailAccountId,
  recipientEmail,
  additionalRecipients = [],
  logger,
}: {
  emailAccountId: string;
  recipientEmail: string;
  additionalRecipients?: string[];
  logger: Logger;
}): Promise<MeetingContext[]> {
  try {
    const calendarProviders = await createCalendarEventProviders(
      emailAccountId,
      logger,
    );

    if (calendarProviders.length === 0) {
      return [];
    }

    const now = new Date();
    const pastLimit = subDays(now, RECENT_MEETING_LOOKBACK_DAYS);
    const futureLimit = addDays(now, UPCOMING_MEETING_LOOKAHEAD_DAYS);
    const normalizedRecipientEmail = recipientEmail.trim().toLowerCase();

    // normalize all additional recipients for privacy filtering
    const normalizedAdditionalRecipients = additionalRecipients.map((e) =>
      e.trim().toLowerCase(),
    );
    const allRequiredAttendees = [
      normalizedRecipientEmail,
      ...normalizedAdditionalRecipients,
    ];

    const pastMeetings: CalendarEvent[] = [];
    const upcomingMeetings: CalendarEvent[] = [];

    for (const provider of calendarProviders) {
      try {
        // fetch recent past meetings
        const pastEvents = await provider.fetchEventsWithAttendee({
          attendeeEmail: normalizedRecipientEmail,
          timeMin: pastLimit,
          timeMax: now,
          maxResults: MAX_MEETINGS_PER_CATEGORY,
        });
        pastMeetings.push(...pastEvents);

        // fetch upcoming meetings
        const upcomingEvents = await provider.fetchEventsWithAttendee({
          attendeeEmail: normalizedRecipientEmail,
          timeMin: now,
          timeMax: futureLimit,
          maxResults: MAX_MEETINGS_PER_CATEGORY,
        });
        upcomingMeetings.push(...upcomingEvents);
      } catch (error) {
        logger.warn("Failed to fetch events from provider", { error });
      }
    }

    // privacy filter: only include meetings where ALL recipients were attendees
    // this prevents leaking private meeting info to CC recipients who weren't invited
    const filterByAllAttendees = (events: CalendarEvent[]) =>
      normalizedAdditionalRecipients.length > 0
        ? events.filter((e) =>
            allRecipientsAreAttendees(e, allRequiredAttendees),
          )
        : events;

    const filteredPastMeetings = filterByAllAttendees(pastMeetings);
    const filteredUpcomingMeetings = filterByAllAttendees(upcomingMeetings);

    // sort past meetings by start time descending (most recent first)
    filteredPastMeetings.sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime(),
    );
    // sort upcoming meetings by start time ascending (soonest first)
    filteredUpcomingMeetings.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    // take only the first few from each category
    const limitedPastMeetings = filteredPastMeetings.slice(
      0,
      MAX_MEETINGS_PER_CATEGORY,
    );
    const limitedUpcomingMeetings = filteredUpcomingMeetings.slice(
      0,
      MAX_MEETINGS_PER_CATEGORY,
    );

    const mapToContext = (
      event: CalendarEvent,
      isPast: boolean,
    ): MeetingContext => ({
      eventTitle: event.title,
      eventTime: event.startTime,
      eventDescription: event.description,
      eventLocation: event.location,
      isPast,
    });

    return [
      ...limitedPastMeetings.map((e) => mapToContext(e, true)),
      ...limitedUpcomingMeetings.map((e) => mapToContext(e, false)),
    ];
  } catch (error) {
    logger.error("Failed to get meeting context", { error });
    return [];
  }
}

function truncateDescription(
  description: string | undefined,
): string | undefined {
  if (!description) return undefined;
  if (description.length <= MAX_DESCRIPTION_LENGTH) return description;
  return `${description.slice(0, MAX_DESCRIPTION_LENGTH)}...`;
}

function formatMeeting(
  meeting: MeetingContext,
  timezone?: string | null,
): string {
  const dateTime = formatInUserTimezone(
    meeting.eventTime,
    timezone,
    "EEEE, MMMM d 'at' h:mm a",
  );

  let details = `- "${meeting.eventTitle}" on ${dateTime}`;
  if (meeting.eventLocation) {
    details += ` (${meeting.eventLocation})`;
  }
  const truncatedDesc = truncateDescription(meeting.eventDescription);
  if (truncatedDesc) {
    details += `\n  Description: ${truncatedDesc}`;
  }
  return details;
}

/**
 * Formats meeting context for inclusion in AI prompts.
 */
export function formatMeetingContextForPrompt(
  meetings: MeetingContext[],
  timezone?: string | null,
): string | null {
  if (meetings.length === 0) {
    return null;
  }

  const pastMeetings = meetings.filter((m) => m.isPast);
  const upcomingMeetings = meetings.filter((m) => !m.isPast);

  const sections: string[] = [];

  if (pastMeetings.length > 0) {
    const pastList = pastMeetings
      .map((m) => formatMeeting(m, timezone))
      .join("\n");
    sections.push(`<recent_meetings>
${pastList}
</recent_meetings>`);
  }

  if (upcomingMeetings.length > 0) {
    const upcomingList = upcomingMeetings
      .map((m) => formatMeeting(m, timezone))
      .join("\n");
    sections.push(`<upcoming_meetings>
${upcomingList}
</upcoming_meetings>`);
  }

  const meetingsSection = sections.join("\n\n");

  return `You have meeting history with this person:

${meetingsSection}

Use this context naturally if relevant. For past meetings, you might reference topics discussed. For upcoming meetings, you might say "Looking forward to our call" or "We can discuss this further in our upcoming meeting."`;
}
