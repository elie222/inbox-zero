import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type {
  CalendarEvent,
  CalendarEventAttendee,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";

const logger = createScopedLogger("meeting-briefs/gather-context");

const MAX_THREADS = 10;
const MAX_MESSAGES_PER_THREAD = 10;
const MAX_MEETINGS = 10;
const THREADS_PER_PARTICIPANT = 3;
const MEETINGS_PER_PARTICIPANT = 3;

export type { CalendarEvent, CalendarEventAttendee };

export interface ExternalGuest {
  email: string;
  name?: string;
}

export interface MeetingBriefingData {
  event: CalendarEvent;
  externalGuests: ExternalGuest[];
  emailThreads: EmailThread[];
  pastMeetings: CalendarEvent[];
}

/**
 * Get external attendees (not from the user's domain)
 */
function getExternalAttendees(
  event: CalendarEvent,
  userEmail: string,
): CalendarEventAttendee[] {
  const userDomain = userEmail.split("@")[1];
  return event.attendees.filter((attendee) => {
    const attendeeDomain = attendee.email.split("@")[1];
    return attendeeDomain !== userDomain && attendee.email !== userEmail;
  });
}

export async function gatherContextForEvent({
  event,
  emailAccountId,
  userEmail,
  provider,
}: {
  event: CalendarEvent;
  emailAccountId: string;
  userEmail: string;
  provider: string;
}): Promise<MeetingBriefingData> {
  const log = logger.with({ emailAccountId, eventId: event.id });

  const externalAttendees = getExternalAttendees(event, userEmail);
  const participantEmails = externalAttendees.map((a) => a.email);

  log.info("Gathering context for external guests", {
    guestCount: externalAttendees.length,
  });

  // Create providers once
  const [emailProvider, calendarProviders] = await Promise.all([
    createEmailProvider({ emailAccountId, provider }),
    createCalendarEventProviders(emailAccountId),
  ]);

  // Fetch email threads and past meetings in parallel
  const [emailThreads, pastMeetings] = await Promise.all([
    fetchEmailThreadsWithParticipants({
      emailProvider,
      participantEmails,
      maxThreads: MAX_THREADS,
      threadsPerParticipant: THREADS_PER_PARTICIPANT,
      log,
    }),
    fetchPastMeetingsWithParticipants({
      calendarProviders,
      participantEmails,
      maxMeetings: MAX_MEETINGS,
      log,
    }),
  ]);

  // Limit messages per thread to avoid overwhelming the AI
  const cappedThreads = emailThreads.map((thread) => ({
    ...thread,
    messages: thread.messages.slice(-MAX_MESSAGES_PER_THREAD),
  }));

  log.info("Gathered context for meeting", {
    threadCount: cappedThreads.length,
    meetingCount: pastMeetings.length,
  });

  return {
    event,
    externalGuests: externalAttendees.map((a) => ({
      email: a.email,
      name: a.name,
    })),
    emailThreads: cappedThreads,
    pastMeetings,
  };
}

async function fetchEmailThreadsWithParticipants({
  emailProvider,
  participantEmails,
  maxThreads,
  threadsPerParticipant,
  log,
}: {
  emailProvider: EmailProvider;
  participantEmails: string[];
  maxThreads: number;
  threadsPerParticipant: number;
  log: ReturnType<typeof logger.with>;
}): Promise<EmailThread[]> {
  if (participantEmails.length === 0) {
    return [];
  }

  const fetchedThreadIds = new Set<string>();
  const allThreads: EmailThread[] = [];

  for (const email of participantEmails) {
    if (allThreads.length >= maxThreads) break;

    try {
      const threads = await emailProvider.getThreadsWithParticipant({
        participantEmail: email,
        maxThreads: threadsPerParticipant,
      });

      // Add only new threads (dedupe by thread ID)
      for (const thread of threads) {
        if (allThreads.length >= maxThreads) break;
        if (!fetchedThreadIds.has(thread.id)) {
          fetchedThreadIds.add(thread.id);
          allThreads.push(thread);
        }
      }
    } catch (error) {
      log.error("Failed to fetch threads for participant", {
        participantEmail: email,
        error,
      });
    }
  }

  return allThreads;
}

async function fetchPastMeetingsWithParticipants({
  calendarProviders,
  participantEmails,
  maxMeetings,
  log,
}: {
  calendarProviders: CalendarEventProvider[];
  participantEmails: string[];
  maxMeetings: number;
  log: ReturnType<typeof logger.with>;
}): Promise<CalendarEvent[]> {
  if (participantEmails.length === 0 || calendarProviders.length === 0) {
    return [];
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const fetchedEventIds = new Set<string>();
  const allMeetings: CalendarEvent[] = [];

  for (const email of participantEmails) {
    if (allMeetings.length >= maxMeetings) break;

    for (const provider of calendarProviders) {
      if (allMeetings.length >= maxMeetings) break;

      try {
        const events = await provider.fetchEventsWithAttendee({
          attendeeEmail: email,
          timeMin: sixMonthsAgo,
          timeMax: new Date(),
          maxResults: MEETINGS_PER_PARTICIPANT,
        });

        // Add only new events (dedupe by event ID)
        for (const event of events) {
          if (allMeetings.length >= maxMeetings) break;
          if (!fetchedEventIds.has(event.id)) {
            fetchedEventIds.add(event.id);
            allMeetings.push(event);
          }
        }
      } catch (error) {
        log.error("Failed to fetch events for participant", {
          participantEmail: email,
          error,
        });
      }
    }
  }

  // Sort by start time descending (most recent first)
  return allMeetings.sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );
}
