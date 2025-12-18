import { subMonths } from "date-fns/subMonths";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type {
  CalendarEvent,
  CalendarEventAttendee,
  CalendarEventProvider,
} from "@/utils/calendar/event-types";
import { extractDomainFromEmail } from "@/utils/email";
import { researchGuestWithPerplexity } from "@/utils/ai/meeting-briefs/research-guest";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";

const MAX_THREADS = 10;
const MAX_MESSAGES_PER_THREAD = 10;
const MAX_MEETINGS = 10;
const THREADS_PER_PARTICIPANT = 3;
const MEETINGS_PER_PARTICIPANT = 3;

export type { CalendarEvent, CalendarEventAttendee };

export interface ExternalGuest {
  email: string;
  name?: string;
  aiResearch?: string | null;
}

export interface MeetingBriefingData {
  event: CalendarEvent;
  externalGuests: ExternalGuest[];
  emailThreads: EmailThread[];
  pastMeetings: CalendarEvent[];
}

export async function gatherContextForEvent({
  event,
  emailAccountId,
  userEmail,
  userDomain,
  provider,
  logger,
}: {
  event: CalendarEvent;
  emailAccountId: string;
  userEmail: string;
  userDomain: string;
  provider: string;
  logger: Logger;
}): Promise<MeetingBriefingData> {
  const externalAttendees = getExternalAttendees(event, userEmail, userDomain);
  const participantEmails = externalAttendees.map((a) => a.email);

  logger.info("Gathering context for external guests", {
    guestCount: externalAttendees.length,
  });

  const [emailProvider, calendarProviders] = await Promise.all([
    createEmailProvider({ emailAccountId, provider, logger }),
    createCalendarEventProviders(emailAccountId),
  ]);

  // Fetch email threads and past meetings in parallel
  const [emailThreads, pastMeetings] = await Promise.all([
    fetchEmailThreadsWithParticipants({
      emailProvider,
      participantEmails,
      maxThreads: MAX_THREADS,
      threadsPerParticipant: THREADS_PER_PARTICIPANT,
      logger,
    }),
    fetchPastMeetingsWithParticipants({
      calendarProviders,
      participantEmails,
      maxMeetings: MAX_MEETINGS,
      logger,
    }),
  ]);

  // Limit messages per thread to avoid overwhelming the AI
  const cappedThreads = emailThreads.map((thread) => ({
    ...thread,
    messages: thread.messages.slice(-MAX_MESSAGES_PER_THREAD),
  }));

  const emailAccount = await getEmailAccountWithAi({
    emailAccountId,
  });

  if (!emailAccount) {
    logger.error("Email account not found");
    throw new SafeError("Email account not found");
  }

  const guestResearchPromises = externalAttendees.map((attendee) =>
    researchGuestWithPerplexity({
      event,
      name: attendee.name,
      email: attendee.email,
      emailAccount,
      logger,
    }).catch((error) => {
      logger.warn("Failed to research guest", {
        email: attendee.email,
        error,
      });
      return null;
    }),
  );

  const aiResearchResults = await Promise.all(guestResearchPromises);

  logger.info("Gathered context for meeting", {
    threadCount: cappedThreads.length,
    meetingCount: pastMeetings.length,
    researchedGuests: aiResearchResults.filter((c) => c !== null).length,
  });

  return {
    event,
    externalGuests: externalAttendees.map((a, index) => ({
      email: a.email,
      name: a.name,
      aiResearch: aiResearchResults[index] ?? null,
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
  logger,
}: {
  emailProvider: EmailProvider;
  participantEmails: string[];
  maxThreads: number;
  threadsPerParticipant: number;
  logger: Logger;
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
      logger.error("Failed to fetch threads for participant", {
        participantEmail: email,
        error,
      });
    }
  }

  return allThreads;
}

function getExternalAttendees(
  event: CalendarEvent,
  userEmail: string,
  userDomain: string,
): CalendarEventAttendee[] {
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  const normalizedUserDomain = userDomain.trim().toLowerCase();

  return event.attendees.filter((attendee) => {
    const normalizedAttendeeEmail = attendee.email.trim().toLowerCase();
    const attendeeDomain = extractDomainFromEmail(normalizedAttendeeEmail);

    if (!attendeeDomain) return false;

    return (
      attendeeDomain !== normalizedUserDomain &&
      normalizedAttendeeEmail !== normalizedUserEmail
    );
  });
}

async function fetchPastMeetingsWithParticipants({
  calendarProviders,
  participantEmails,
  maxMeetings,
  logger,
}: {
  calendarProviders: CalendarEventProvider[];
  participantEmails: string[];
  maxMeetings: number;
  logger: Logger;
}): Promise<CalendarEvent[]> {
  if (participantEmails.length === 0 || calendarProviders.length === 0) {
    return [];
  }

  const sixMonthsAgo = subMonths(new Date(), 6);

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
        logger.error("Failed to fetch events for participant", {
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
