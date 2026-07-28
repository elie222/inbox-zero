import { addDays, subDays } from "date-fns";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { normalizeDisplayName } from "@/utils/contacts";
import { extractDomainFromEmail } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// People you've actually sat in a meeting with are the strongest signal that
// someone belongs in your contacts, and they're often not in your mail
// history at all — an organizer adds them and you never exchange email.
const LOOK_BACK_DAYS = 90;
const LOOK_AHEAD_DAYS = 30;
const MAX_EVENTS_PER_PROVIDER = 250;

export type MeetingAttendeeSuggestion = {
  email: string;
  name: string | null;
  domain: string;
  meetingCount: number;
  lastMetAt: Date;
  // The most recent meeting they were on, for context in the list
  lastMeetingTitle: string;
};

// An empty list has several very different causes, and "no new people"
// covers all of them badly. The counts let the UI say which one it is.
export type MeetingAttendeeResult = {
  attendees: MeetingAttendeeSuggestion[];
  calendarsConnected: number;
  eventsScanned: number;
  // Attendees dropped because they're already saved, ignored, or you
  alreadyKnown: number;
};

export async function getMeetingAttendeeSuggestions({
  emailAccountId,
  userEmail,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  logger: Logger;
}): Promise<MeetingAttendeeResult> {
  const providers = await createCalendarEventProviders(emailAccountId, logger);
  if (!providers.length) {
    return {
      attendees: [],
      calendarsConnected: 0,
      eventsScanned: 0,
      alreadyKnown: 0,
    };
  }

  const now = new Date();
  const results = await Promise.allSettled(
    providers.map((provider) =>
      provider.fetchEvents({
        timeMin: subDays(now, LOOK_BACK_DAYS),
        timeMax: addDays(now, LOOK_AHEAD_DAYS),
        maxResults: MAX_EVENTS_PER_PROVIDER,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn("Failed to read a calendar for attendee suggestions", {
        error: result.reason,
      });
    }
  }

  const events = results
    .filter(
      (result): result is PromiseFulfilledResult<CalendarEvent[]> =>
        result.status === "fulfilled",
    )
    .flatMap((result) => result.value);

  const [saved, account] = await Promise.all([
    prisma.contact.findMany({
      where: { emailAccountId, email: { not: null } },
      select: { email: true },
    }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { ignoredContactEmails: true, ignoredContactDomains: true },
    }),
  ]);

  const excluded = new Set(
    [
      userEmail,
      ...saved.flatMap((contact) => (contact.email ? [contact.email] : [])),
      ...(account?.ignoredContactEmails ?? []),
    ].map((email) => email.toLowerCase()),
  );
  const ignoredDomains = new Set(
    (account?.ignoredContactDomains ?? []).map((domain) =>
      domain.toLowerCase(),
    ),
  );

  const { attendees, alreadyKnown } = collectAttendees({
    events,
    excluded,
    ignoredDomains,
  });

  logger.info("Built meeting attendee suggestions", {
    calendarsConnected: providers.length,
    eventsScanned: events.length,
    suggested: attendees.length,
    alreadyKnown,
  });

  return {
    attendees,
    calendarsConnected: providers.length,
    eventsScanned: events.length,
    alreadyKnown,
  };
}

function collectAttendees({
  events,
  excluded,
  ignoredDomains,
}: {
  events: CalendarEvent[];
  excluded: Set<string>;
  ignoredDomains: Set<string>;
}): { attendees: MeetingAttendeeSuggestion[]; alreadyKnown: number } {
  const byEmail = new Map<string, MeetingAttendeeSuggestion>();
  const known = new Set<string>();

  for (const event of events) {
    for (const attendee of event.attendees) {
      const email = attendee.email.trim().toLowerCase();
      if (!email) continue;
      if (excluded.has(email)) {
        known.add(email);
        continue;
      }

      const domain = extractDomainFromEmail(email).toLowerCase();
      if (!domain) continue;
      if (ignoredDomains.has(domain)) {
        known.add(email);
        continue;
      }

      const existing = byEmail.get(email);
      if (!existing) {
        byEmail.set(email, {
          email,
          name: normalizeDisplayName(attendee.name?.trim() || null),
          domain,
          meetingCount: 1,
          lastMetAt: event.startTime,
          lastMeetingTitle: event.title,
        });
        continue;
      }

      existing.meetingCount += 1;
      // Prefer a name from the most recent invite — people change how they
      // appear, and the newest spelling is the one to save
      if (event.startTime > existing.lastMetAt) {
        existing.lastMetAt = event.startTime;
        existing.lastMeetingTitle = event.title;
        existing.name =
          normalizeDisplayName(attendee.name?.trim() || null) ?? existing.name;
      } else if (!existing.name) {
        existing.name = normalizeDisplayName(attendee.name?.trim() || null);
      }
    }
  }

  return {
    attendees: [...byEmail.values()].sort(
      (a, b) => b.lastMetAt.getTime() - a.lastMetAt.getTime(),
    ),
    alreadyKnown: known.size,
  };
}
