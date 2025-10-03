import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recallRequest } from "@/utils/recall/request";
import { parseISO, subMinutes, isAfter } from "date-fns";
import type {
  CalendarEvent,
  RecallBot,
  RecallCalendarEventResponse,
} from "@/app/api/recall/webhook/types";
import { MeetingStatus } from "@prisma/client";

const logger = createScopedLogger("recall/bot");

export function generateDeduplicationKey(event: CalendarEvent): string {
  return `${event.start_time}-${event.meeting_url}`;
}

export async function createBot(meetingUrl: string): Promise<RecallBot> {
  return recallRequest<RecallBot>("/api/v1/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: "Inbox Zero Note Taker",
      output_image: "https://getinboxzero.com/icons/icon-512x512.png",
      recording_config: {
        transcript: {
          provider: {
            meeting_captions: {},
          },
        },
      },
    }),
  });
}

export async function removeBotFromCalendarEvent(
  eventId: string,
): Promise<void> {
  await recallRequest(`/api/v2/calendar-events/${eventId}/bot/`, {
    method: "DELETE",
  });
}

export async function scheduleBotForEvent(
  event: CalendarEvent,
  emailAccountId: string,
  recallCalendarId: string,
): Promise<RecallCalendarEventResponse | null> {
  if (!event.meeting_url) {
    logger.warn("No meeting URL found for event", {
      event_id: event.id,
      title: event.title,
    });
    return null;
  }

  const eventStart = parseISO(event.start_time);
  const now = new Date();
  const fiveMinutesAgo = subMinutes(now, 5);

  if (!isAfter(eventStart, fiveMinutesAgo)) {
    logger.warn("Event is too far in the past", {
      event_id: event.id,
      start_time: event.start_time,
    });
    return null;
  }

  try {
    const deduplicationKey = generateDeduplicationKey(event);

    const botResponse = await createBot(event.meeting_url || "");
    const botId = botResponse.id;

    await prisma.meeting.upsert({
      where: { botId: botId },
      update: {
        botWillJoinAt: new Date(event.start_time),
        meetingUrl: event.meeting_url || "",
        status: MeetingStatus.SCHEDULED,
        deduplicationKey,
      },
      create: {
        botId: botId,
        eventId: event.id,
        emailAccountId: emailAccountId,
        meetingUrl: event.meeting_url || "",
        botWillJoinAt: new Date(event.start_time),
        status: MeetingStatus.SCHEDULED,
        deduplicationKey,
      },
    });

    logger.info("Bot created and stored in database", {
      bot_id: botId,
      event_id: event.id,
      email_account_id: emailAccountId,
      recall_calendar_id: recallCalendarId,
      deduplication_key: deduplicationKey,
    });

    return {
      event: {
        id: event.id,
        start_time: event.start_time,
        end_time: event.end_time,
        calendar_id: recallCalendarId,
        meeting_url: event.meeting_url,
        title: event.title,
        is_deleted: false,
        bots: [
          {
            bot_id: botId,
            start_time: event.start_time,
            deduplication_key: deduplicationKey,
            meeting_url: event.meeting_url || "",
          },
        ],
      },
      bots: [
        {
          bot_id: botId,
          start_time: event.start_time,
          deduplication_key: deduplicationKey,
          meeting_url: event.meeting_url || "",
        },
      ],
    };
  } catch (error) {
    logger.error("Failed to schedule bot for event", {
      error,
      event_id: event.id,
      email_account_id: emailAccountId,
    });
    return null;
  }
}

export async function rescheduleBotsForUpdatedEvents(
  emailAccountId: string,
  updatedEvents: CalendarEvent[],
  recallCalendarId: string,
): Promise<void> {
  for (const event of updatedEvents) {
    try {
      const existingMeeting = await prisma.meeting.findFirst({
        where: {
          eventId: event.id,
          emailAccountId: emailAccountId,
          status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.ACTIVE] },
        },
      });

      if (existingMeeting) {
        try {
          await removeBotFromCalendarEvent(event.id);
        } catch (error) {
          logger.warn("Failed to remove existing bot via Recall API", {
            botId: existingMeeting.botId,
            eventId: event.id,
            error: error instanceof Error ? error.message : error,
          });
        }

        await prisma.meeting.update({
          where: { id: existingMeeting.id },
          data: { status: "CANCELLED" },
        });
      }

      if (event.meeting_url) {
        await scheduleBotForEvent(event, emailAccountId, recallCalendarId);
      }
    } catch (error) {
      logger.error("Error rescheduling bot for event", {
        error,
        eventId: event.id,
        eventTitle: event.title,
        emailAccountId,
        recallCalendarId,
      });
    }
  }
}
