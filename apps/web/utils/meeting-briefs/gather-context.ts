import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import { getUnifiedEventsWithAttendee } from "@/utils/calendar/unified-events";
import type { CalendarEvent } from "@/utils/calendar/calendar-types";
import { getExternalAttendees } from "./fetch-upcoming-events";

const logger = createScopedLogger("meeting-briefs/gather-context");

const MAX_THREADS = 10;
const MAX_MESSAGES_PER_THREAD = 10;
const MAX_MEETINGS = 10;
const THREADS_PER_PARTICIPANT = 3;

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

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

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
      emailAccountId,
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
  emailAccountId,
  participantEmails,
  maxMeetings,
  log,
}: {
  emailAccountId: string;
  participantEmails: string[];
  maxMeetings: number;
  log: ReturnType<typeof logger.with>;
}): Promise<CalendarEvent[]> {
  if (participantEmails.length === 0) {
    return [];
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const fetchedEventIds = new Set<string>();
  const allMeetings: CalendarEvent[] = [];
  const meetingsPerParticipant = Math.max(
    1,
    Math.ceil(maxMeetings / participantEmails.length),
  );

  for (const email of participantEmails) {
    if (allMeetings.length >= maxMeetings) break;

    try {
      const meetings = await getUnifiedEventsWithAttendee({
        emailAccountId,
        attendeeEmail: email,
        timeMin: sixMonthsAgo,
        timeMax: new Date(),
        maxResults: meetingsPerParticipant,
      });

      // Add only new meetings (dedupe by event ID)
      for (const meeting of meetings) {
        if (allMeetings.length >= maxMeetings) break;
        if (!fetchedEventIds.has(meeting.id)) {
          fetchedEventIds.add(meeting.id);
          allMeetings.push(meeting);
        }
      }
    } catch (error) {
      log.error("Failed to fetch meetings for participant", {
        participantEmail: email,
        error,
      });
    }
  }

  // Sort by start time descending (most recent first)
  return allMeetings.sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );
}
