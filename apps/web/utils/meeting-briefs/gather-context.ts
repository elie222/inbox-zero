import { mapWithConcurrency } from "@/utils/async";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
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

const PARTICIPANT_CONCURRENCY = 3;
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

export interface InternalTeamMember {
  email: string;
  name?: string;
}

export interface MeetingBriefingData {
  emailThreads: EmailThread[];
  event: CalendarEvent;
  externalGuests: ExternalGuest[];
  internalTeamMembers: InternalTeamMember[];
  pastMeetings: CalendarEvent[];
}

export async function gatherContextForEvent({
  event,
  emailAccountId,
  externalAttendees,
  internalAttendees,
  provider,
  logger,
}: {
  event: CalendarEvent;
  emailAccountId: string;
  externalAttendees: CalendarEventAttendee[];
  internalAttendees: CalendarEventAttendee[];
  provider: string;
  logger: Logger;
}): Promise<MeetingBriefingData> {
  const participantEmails = [
    ...new Set(
      [...externalAttendees, ...internalAttendees].map((a) =>
        a.email.trim().toLowerCase(),
      ),
    ),
  ];

  logger.info("Gathering context for meeting attendees", {
    guestCount: externalAttendees.length,
    internalTeamCount: internalAttendees.length,
  });

  const [emailProvider, calendarProviders] = await Promise.all([
    createEmailProvider({ emailAccountId, provider, logger }),
    createCalendarEventProviders(emailAccountId, logger),
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
    messages: [...thread.messages]
      .sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b))
      .slice(-MAX_MESSAGES_PER_THREAD),
  }));

  logger.info("Gathered context for meeting", {
    threadCount: cappedThreads.length,
    meetingCount: pastMeetings.length,
  });

  return {
    event,
    externalGuests: externalAttendees.map((a) => ({
      email: a.email,
      name: a.name,
    })),
    internalTeamMembers: internalAttendees.map((a) => ({
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

  const threadsByParticipant = await mapWithConcurrency(
    participantEmails,
    PARTICIPANT_CONCURRENCY,
    async (email) => {
      try {
        return await emailProvider.getThreadsWithParticipant({
          participantEmail: email,
          maxThreads: threadsPerParticipant,
        });
      } catch (error) {
        logger.error("Failed to fetch threads for participant", { error });
        return [];
      }
    },
  );

  return selectParticipantContext(threadsByParticipant, maxThreads);
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

  const meetingsByParticipant = await mapWithConcurrency(
    participantEmails,
    PARTICIPANT_CONCURRENCY,
    async (email) => {
      const meetings = new Map<string, CalendarEvent>();
      for (const provider of calendarProviders) {
        try {
          const events = await provider.fetchEventsWithAttendee({
            attendeeEmail: email,
            timeMin: sixMonthsAgo,
            timeMax: new Date(),
            maxResults: MEETINGS_PER_PARTICIPANT,
          });
          for (const event of events) {
            if (!meetings.has(event.id)) meetings.set(event.id, event);
          }
        } catch (error) {
          logger.error("Failed to fetch events for participant", { error });
        }
      }
      return [...meetings.values()].sort(
        (a, b) => b.startTime.getTime() - a.startTime.getTime(),
      );
    },
  );

  return selectParticipantContext(meetingsByParticipant, maxMeetings).sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );
}

// Take one result per participant at a time so early attendees cannot exhaust the budget.
function selectParticipantContext<T extends { id: string }>(
  groups: T[][],
  limit: number,
): T[] {
  const selected = new Map<string, T>();
  const depth = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < depth; index++) {
    for (const group of groups) {
      const item = group[index];
      if (item && !selected.has(item.id)) selected.set(item.id, item);
      if (selected.size >= limit) return [...selected.values()];
    }
  }
  return [...selected.values()];
}
