import prisma from "@/utils/prisma";
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
    await runMeetingBrief({
      event,
      emailAccount,
      emailAccountId,
      logger,
    });
  }

  logger.info("Finished processing meeting briefings");
}

export async function runMeetingBrief({
  event,
  emailAccount,
  emailAccountId,
  logger,
}: {
  event: CalendarEvent;
  emailAccount: EmailAccountForBrief;
  emailAccountId: string;
  logger: Logger;
}): Promise<{ success: boolean; message?: string }> {
  const userEmail = emailAccount.email;
  const provider = emailAccount.account.provider;

  const eventLog = logger.with({
    eventId: event.id,
    eventTitle: event.title,
  });

  try {
    // Gather context for all external guests
    const briefingData = await gatherContextForEvent({
      event,
      emailAccountId,
      userEmail,
      provider,
    });

    if (briefingData.externalGuests.length === 0) {
      eventLog.info("No external guests found for event, skipping");
      return { success: false, message: "No external guests found" };
    }

    // Generate AI briefing
    const briefingContent = await aiGenerateMeetingBriefing({
      briefingData,
      emailAccount,
    });

    // Send the briefing email
    await sendBriefingEmail({
      event,
      briefingContent,
      guestCount: briefingData.externalGuests.length,
      emailAccountId,
      userEmail,
      provider,
      logger: eventLog,
    });

    await prisma.meetingBriefing.create({
      data: {
        calendarEventId: event.id,
        eventTitle: event.title,
        eventStartTime: event.startTime,
        guestCount: briefingData.externalGuests.length,
        status: MeetingBriefingStatus.SENT,
        emailAccountId,
      },
    });

    eventLog.info("Meeting briefing sent successfully");
    return { success: true, message: "Brief sent successfully" };
  } catch (error) {
    eventLog.error("Failed to process meeting briefing", { error });

    await prisma.meetingBriefing.create({
      data: {
        calendarEventId: event.id,
        eventTitle: event.title,
        eventStartTime: event.startTime,
        guestCount: event.attendees.length,
        status: MeetingBriefingStatus.FAILED,
        emailAccountId,
      },
    });

    throw error;
  }
}
