import { addDays } from "date-fns/addDays";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("RecipientMeetingContext");

const UPCOMING_DAYS = 7;
const MAX_MEETINGS = 3;

export interface MeetingContext {
  eventTitle: string;
  eventTime: Date;
  eventDescription?: string;
  eventLocation?: string;
}

/**
 * Fetches upcoming meeting context for a specific recipient.
 * Used to provide cross-context awareness when drafting emails.
 */
export async function getUpcomingMeetingContext({
  emailAccountId,
  recipientEmail,
}: {
  emailAccountId: string;
  recipientEmail: string;
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
    const futureLimit = addDays(now, UPCOMING_DAYS);
    const normalizedRecipientEmail = recipientEmail.trim().toLowerCase();

    const allMeetings: CalendarEvent[] = [];

    for (const provider of calendarProviders) {
      try {
        const events = await provider.fetchEventsWithAttendee({
          attendeeEmail: normalizedRecipientEmail,
          timeMin: now,
          timeMax: futureLimit,
          maxResults: MAX_MEETINGS,
        });

        allMeetings.push(...events);
      } catch (error) {
        logger.warn("Failed to fetch events from provider", { error });
      }
    }

    // sort by start time ascending (soonest first)
    allMeetings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // take only the first few meetings
    const upcomingMeetings = allMeetings.slice(0, MAX_MEETINGS);

    return upcomingMeetings.map((event) => ({
      eventTitle: event.title,
      eventTime: event.startTime,
      eventDescription: event.description,
      eventLocation: event.location,
    }));
  } catch (error) {
    logger.error("Failed to get upcoming meeting context", { error });
    return [];
  }
}

/**
 * Formats meeting context for inclusion in AI prompts.
 */
export function formatMeetingContextForPrompt(
  meetings: MeetingContext[],
): string | null {
  if (meetings.length === 0) {
    return null;
  }

  const meetingList = meetings
    .map((meeting) => {
      const date = meeting.eventTime.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const time = meeting.eventTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      let details = `- "${meeting.eventTitle}" on ${date} at ${time}`;
      if (meeting.eventLocation) {
        details += ` (${meeting.eventLocation})`;
      }
      return details;
    })
    .join("\n");

  return `You have upcoming meeting(s) scheduled with this person:

<upcoming_meetings>
${meetingList}
</upcoming_meetings>

Consider naturally referencing these meetings if relevant to the email topic (e.g., "Looking forward to our call on Thursday" or "We can discuss this further in our upcoming meeting").`;
}
