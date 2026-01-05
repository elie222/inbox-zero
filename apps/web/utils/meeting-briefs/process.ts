import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { MeetingBriefingStatus } from "@/generated/prisma/enums";
import {
  fetchUpcomingEvents,
  filterEventsWithExternalGuests,
} from "./fetch-upcoming-events";
import { gatherContextForEvent } from "./gather-context";
import { aiGenerateMeetingBriefing } from "@/utils/ai/meeting-briefs/generate-briefing";
import { sendBriefingEmail } from "./send-briefing";
import type { Logger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { extractDomainFromEmail } from "@/utils/email";

export type EmailAccountForBrief = {
  id: string;
  userId: string;
  email: string;
  about: string | null;
  multiRuleSelectionEnabled: boolean;
  timezone: string | null;
  calendarBookingLink: string | null;
  user: {
    aiProvider: string | null;
    aiModel: string | null;
    aiApiKey: string | null;
  };
  account: {
    provider: string;
  };
};

export async function processMeetingBriefings({
  emailAccountId,
  userEmail,
  minutesBefore,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  minutesBefore: number;
  logger: Logger;
}): Promise<void> {
  logger.info("Processing meeting briefings", { minutesBefore });

  // 1. Fetch upcoming events
  const allEvents = await fetchUpcomingEvents({
    emailAccountId,
    minutesBefore,
    logger,
  });

  logger.info("Fetched upcoming events", { count: allEvents.length });

  // 2. Filter to events with external guests
  const eventsWithExternalGuests = filterEventsWithExternalGuests(
    allEvents,
    userEmail,
  );

  if (eventsWithExternalGuests.length === 0) {
    logger.info("No events with external guests, skipping");
    return;
  }

  // 3. Check which events haven't been briefed yet
  const existingBriefings = await prisma.meetingBriefing.findMany({
    where: {
      emailAccountId,
      calendarEventId: {
        in: eventsWithExternalGuests.map((e) => e.id),
      },
    },
    select: { calendarEventId: true },
  });

  const briefedEventIds = new Set(
    existingBriefings.map((b) => b.calendarEventId),
  );
  const eventsToProcess = eventsWithExternalGuests.filter(
    (event) => !briefedEventIds.has(event.id),
  );

  if (eventsToProcess.length === 0) {
    logger.info("All events already briefed, skipping");
    return;
  }

  // Get full email account for AI generation
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    logger.error("Email account not found");
    return;
  }

  // 4. Process each event
  for (const event of eventsToProcess) {
    try {
      await runMeetingBrief({
        event,
        emailAccount,
        emailAccountId,
        isTestSend: false,
        logger,
      });
    } catch {
      // Error already logged and saved by runMeetingBrief
    }
  }

  logger.info("Finished processing meeting briefings");
}

export async function runMeetingBrief({
  event,
  emailAccount,
  emailAccountId,
  logger,
  isTestSend,
}: {
  event: CalendarEvent;
  emailAccount: EmailAccountForBrief;
  emailAccountId: string;
  logger: Logger;
  isTestSend: boolean;
}): Promise<{ success: boolean; message?: string }> {
  const userEmail = emailAccount.email;
  const provider = emailAccount.account.provider;

  const eventLog = logger.with({ eventId: event.id });

  const userDomain = extractDomainFromEmail(userEmail);
  const externalGuestCount = event.attendees.filter((attendee) => {
    const attendeeDomain = extractDomainFromEmail(attendee.email ?? "");
    return attendeeDomain && attendeeDomain !== userDomain;
  }).length;

  if (!isTestSend) {
    const claimed = await claimMeetingBriefing({
      emailAccountId,
      calendarEventId: event.id,
      eventTitle: event.title,
      eventStartTime: event.startTime,
      guestCount: externalGuestCount,
    });

    if (!claimed) {
      eventLog.info("Event already claimed by another process, skipping");
      return { success: false, message: "Already being processed" };
    }
  }

  try {
    const briefingData = await gatherContextForEvent({
      event,
      emailAccountId,
      userEmail,
      userDomain,
      provider,
      logger: eventLog,
    });

    if (briefingData.externalGuests.length === 0) {
      eventLog.info("No external guests found for event, skipping");
      if (!isTestSend) {
        await upsertMeetingBriefingStatus({
          emailAccountId,
          calendarEventId: event.id,
          eventTitle: event.title,
          eventStartTime: event.startTime,
          guestCount: externalGuestCount,
          status: MeetingBriefingStatus.SKIPPED,
          logger: eventLog,
        });
      }
      return { success: false, message: "No external guests found" };
    }

    const briefingContent = await aiGenerateMeetingBriefing({
      briefingData,
      emailAccount,
      logger: eventLog,
    });

    await sendBriefingEmail({
      event,
      briefingContent,
      internalTeamMembers: briefingData.internalTeamMembers,
      emailAccountId,
      userEmail,
      provider,
      userTimezone: emailAccount.timezone,
      logger: eventLog,
    });

    if (!isTestSend) {
      await upsertMeetingBriefingStatus({
        emailAccountId,
        calendarEventId: event.id,
        eventTitle: event.title,
        eventStartTime: event.startTime,
        guestCount: externalGuestCount,
        status: MeetingBriefingStatus.SENT,
        logger: eventLog,
      });
    }

    eventLog.info("Meeting briefing sent successfully");
    return { success: true, message: "Brief sent successfully" };
  } catch (error) {
    eventLog.error("Failed to process meeting briefing", { error });

    if (!isTestSend) {
      await upsertMeetingBriefingStatus({
        emailAccountId,
        calendarEventId: event.id,
        eventTitle: event.title,
        eventStartTime: event.startTime,
        guestCount: externalGuestCount,
        status: MeetingBriefingStatus.FAILED,
        logger: eventLog,
      });
    }

    throw error;
  }
}

async function claimMeetingBriefing({
  emailAccountId,
  calendarEventId,
  eventTitle,
  eventStartTime,
  guestCount,
}: {
  emailAccountId: string;
  calendarEventId: string;
  eventTitle: string;
  eventStartTime: Date;
  guestCount: number;
}): Promise<boolean> {
  try {
    await prisma.meetingBriefing.create({
      data: {
        emailAccountId,
        calendarEventId,
        eventTitle,
        eventStartTime,
        guestCount,
        status: MeetingBriefingStatus.PENDING,
      },
    });
    return true;
  } catch (error) {
    if (isDuplicateError(error)) {
      return false;
    }
    throw error;
  }
}

async function upsertMeetingBriefingStatus({
  emailAccountId,
  calendarEventId,
  eventTitle,
  eventStartTime,
  guestCount,
  status,
  logger,
}: {
  emailAccountId: string;
  calendarEventId: string;
  eventTitle: string;
  eventStartTime: Date;
  guestCount: number;
  status: MeetingBriefingStatus;
  logger: Logger;
}): Promise<void> {
  try {
    await prisma.meetingBriefing.upsert({
      where: {
        emailAccountId_calendarEventId: {
          emailAccountId,
          calendarEventId,
        },
      },
      create: {
        emailAccountId,
        calendarEventId,
        eventTitle,
        eventStartTime,
        guestCount,
        status,
      },
      update: { status },
    });
  } catch (error) {
    logger.error("Failed to upsert meeting briefing status", { error, status });
  }
}
