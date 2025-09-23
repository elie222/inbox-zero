import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recallRequest } from "@/utils/recall/request";
import type {
  CalendarEvent,
  RecallCalendarEventResponse,
} from "@/app/api/recall/webhook/types";

const logger = createScopedLogger("recall/bot");

export function generateDeduplicationKey(event: CalendarEvent): string {
  return `${event.start_time}-${event.meeting_url}`;
}

export async function addBotToCalendarEvent(
  eventId: string,
  deduplicationKey: string,
  botConfig?: { bot_name?: string; language?: string },
): Promise<RecallCalendarEventResponse> {
  return recallRequest<RecallCalendarEventResponse>(
    `api/v2/calendar-events/${eventId}/bot/`,
    {
      method: "POST",
      body: JSON.stringify({
        deduplication_key: deduplicationKey,
        bot_config: botConfig,
      }),
    },
  );
}

export async function removeBotFromCalendarEvent(
  eventId: string,
): Promise<void> {
  await recallRequest(`api/v2/calendar-events/${eventId}/bot/`, {
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

  const eventStart = new Date(event.start_time);
  const now = new Date();

  if (eventStart <= now) {
    logger.warn("Event is in the past or starting now", {
      event_id: event.id,
      start_time: event.start_time,
      now: now.toISOString(),
    });
    return null;
  }

  try {
    const deduplicationKey = generateDeduplicationKey(event);

    const response = await addBotToCalendarEvent(event.id, deduplicationKey, {
      bot_name: "Inbox Zero Note Taker",
      language: "en",
    });

    if (response.bots && response.bots.length > 0) {
      const bot = response.bots[0];

      await prisma.recallMeeting.create({
        data: {
          botId: bot.bot_id,
          eventId: event.id,
          emailAccountId: emailAccountId,
          meetingUrl: event.meeting_url || "",
          botWillJoinAt: new Date(event.start_time),
          status: "SCHEDULED",
        },
      });

      logger.info("Bot scheduled and stored in database", {
        bot_id: bot.bot_id,
        email_account_id: emailAccountId,
        recall_calendar_id: recallCalendarId,
      });
    }

    return response;
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
      const existingMeeting = await prisma.recallMeeting.findFirst({
        where: {
          eventId: event.id,
          emailAccountId: emailAccountId,
          status: { in: ["SCHEDULED", "ACTIVE"] },
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

        await prisma.recallMeeting.update({
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
