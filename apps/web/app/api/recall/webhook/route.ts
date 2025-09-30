import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { verifySvixWebhook } from "@/utils/recall/verify-svix-webhook";
import { rescheduleBotsForUpdatedEvents } from "@/utils/recall/bot";
import type { CalendarEvent } from "./types";
import {
  getRecallCalendar,
  deleteRecallCalendar,
  fetchCalendarEvents,
} from "@/utils/recall/calendar";
import {
  getTranscriptMetadata,
  fetchTranscriptContent,
} from "@/utils/recall/transcript";
import type {
  RecallWebhookPayload,
  CalendarUpdateEvent,
  CalendarSyncEventsEvent,
  TranscriptDoneEvent,
} from "./types";

const logger = createScopedLogger("recall/webhook");

export const POST = withError(async (request) => {
  const rawBody = await request.text();

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.error("Missing required Svix headers", {
      hasSvixId: !!svixId,
      hasSvixTimestamp: !!svixTimestamp,
      hasSvixSignature: !!svixSignature,
    });
    return NextResponse.json(
      { message: "Missing required headers" },
      { status: 400 },
    );
  }

  if (env.RECALL_WEBHOOK_SECRET) {
    // Parse multiple signatures from svix-signature header
    // Format: "v1,signature1 v1,signature2" - split on spaces only, not commas
    const signatures = svixSignature
      .split(/\s+/)
      .map((sig) => sig.trim())
      .filter((sig) => sig);

    let isValid = false;
    for (const signature of signatures) {
      // Extract the actual signature after the version prefix (e.g., "v1,")
      const actualSignature = signature.includes(",")
        ? signature.split(",")[1]
        : signature;

      if (
        verifySvixWebhook(
          rawBody,
          svixId,
          svixTimestamp,
          actualSignature,
          env.RECALL_WEBHOOK_SECRET,
        )
      ) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      logger.error("Invalid webhook signature", {
        signatures: signatures.length,
        hasSecret: !!env.RECALL_WEBHOOK_SECRET,
        secretLength: env.RECALL_WEBHOOK_SECRET?.length || 0,
      });
      return NextResponse.json(
        { message: "Invalid signature" },
        { status: 403 },
      );
    }
  } else {
    logger.warn(
      "RECALL_WEBHOOK_SECRET not configured, skipping signature verification",
    );
  }

  const body = JSON.parse(rawBody) as RecallWebhookPayload;
  const eventType = body.event;

  try {
    await processRecallWebhook(body);

    return NextResponse.json({
      message: "Webhook processed successfully",
    });
  } catch (error) {
    logger.error("Error processing Recall webhook", {
      error,
      eventType,
    });

    if (error instanceof Error && error.message.includes("invalid_grant")) {
      return NextResponse.json(
        { message: "Invalid grant error" },
        { status: 200 },
      );
    }

    throw error;
  }
});

async function processRecallWebhook(payload: RecallWebhookPayload) {
  const eventType = payload.event;

  switch (eventType) {
    case "calendar.sync_events":
      await handleCalendarSyncEvents(payload as CalendarSyncEventsEvent);
      break;
    case "calendar.update":
      await handleCalendarUpdate(payload as CalendarUpdateEvent);
      break;
    case "transcript.done":
      await handleTranscriptDone(payload as TranscriptDoneEvent);
      break;
    default:
      logger.warn("Unsupported event type", { eventType });
      return NextResponse.json(
        { message: "Unsupported event type" },
        { status: 400 },
      );
  }
}

async function fetchCalendarEventsFromRecall(
  recallCalendarId: string,
  lastUpdatedTs?: string,
): Promise<CalendarEvent[]> {
  try {
    const data = await fetchCalendarEvents(recallCalendarId, lastUpdatedTs);

    const events: CalendarEvent[] = [];

    for (const event of data.results || []) {
      if (event.is_deleted) {
        continue;
      }

      if (event.meeting_url && event.start_time) {
        events.push({
          id: event.id,
          title: event.title || "Untitled Meeting",
          start_time: event.start_time,
          end_time: event.end_time || event.start_time,
          meeting_url: event.meeting_url,
          participants: [],
        });
      } else {
        logger.warn("Skipping event - missing meeting_url or start_time", {
          eventId: event.id,
          title: event.title,
          hasMeetingUrl: !!event.meeting_url,
          hasStartTime: !!event.start_time,
        });
      }
    }

    return events;
  } catch (error) {
    logger.error("Error fetching calendar events from Recall", {
      error,
      recallCalendarId,
    });
    return [];
  }
}

async function handleCalendarSyncEvents(payload: CalendarSyncEventsEvent) {
  const calendarId = payload.data.calendar_id;
  const lastUpdatedTs = payload.data.last_updated_ts;

  const connection = await prisma.calendarConnection.findUnique({
    where: { recallCalendarId: calendarId },
    include: {
      emailAccount: true,
      calendars: {
        where: { isEnabled: true },
      },
    },
  });

  if (!connection) {
    // Check if this is our current calendar ID
    const currentConnection = await prisma.calendarConnection.findFirst({
      where: { isConnected: true },
      select: { id: true, recallCalendarId: true, email: true },
    });

    logger.warn(
      "No internal calendar connection found for Recall calendar ID",
      {
        recallCalendarId: calendarId,
        currentConnection: currentConnection
          ? {
              id: currentConnection.id,
              recallCalendarId: currentConnection.recallCalendarId,
              email: currentConnection.email,
            }
          : null,
        isCurrentCalendar: currentConnection?.recallCalendarId === calendarId,
      },
    );
    return;
  }

  if (connection.calendars.length === 0) {
    logger.info(
      "No enabled calendars found for this connection, skipping bot rescheduling",
      {
        recallCalendarId: calendarId,
        connectionId: connection.id,
      },
    );
    return;
  }

  try {
    const updatedEvents = await fetchCalendarEventsFromRecall(
      calendarId,
      lastUpdatedTs,
    );

    if (updatedEvents.length > 0) {
      await rescheduleBotsForUpdatedEvents(
        connection.emailAccountId,
        updatedEvents,
        calendarId,
      );
    } else {
    }
  } catch (error) {
    logger.error("Error processing calendar sync events", {
      error,
      recallCalendarId: calendarId,
      connectionId: connection.id,
    });
  }
}

async function handleCalendarUpdate(payload: CalendarUpdateEvent) {
  const calendarId = payload.data.calendar_id;

  try {
    const recallCalendar = await getRecallCalendar(calendarId);

    if (!recallCalendar || recallCalendar.status !== "connected") {
      const connection = await prisma.calendarConnection.findUnique({
        where: { recallCalendarId: calendarId },
      });

      if (connection) {
        try {
          await deleteRecallCalendar(calendarId);
        } catch (error) {
          logger.warn("Failed to delete Recall calendar during disconnect", {
            error,
            recallCalendarId: calendarId,
            connectionId: connection.id,
          });
        }

        await prisma.calendarConnection.update({
          where: { id: connection.id },
          data: { isConnected: false, recallCalendarId: null },
        });

        await prisma.recallMeeting.updateMany({
          where: {
            emailAccountId: connection.emailAccountId,
            status: { in: ["SCHEDULED", "ACTIVE"] },
          },
          data: { status: "CANCELLED" },
        });

        logger.info(
          "Disconnected calendar connection and cleared Recall calendar ID",
          {
            connectionId: connection.id,
            emailAccountId: connection.emailAccountId,
            recallCalendarId: calendarId,
          },
        );
      }

      return;
    }
  } catch (error) {
    logger.error("Error handling calendar status", {
      error,
      recallCalendarId: calendarId,
    });
  }

  const connection = await prisma.calendarConnection.findUnique({
    where: { recallCalendarId: calendarId },
    include: {
      emailAccount: true,
      calendars: {
        where: { isEnabled: true },
      },
    },
  });

  if (!connection) {
    logger.warn(
      "No internal calendar connection found for Recall calendar ID",
      {
        recallCalendarId: calendarId,
      },
    );
    return;
  }

  try {
    const updatedEvents = await fetchCalendarEventsFromRecall(calendarId);

    if (updatedEvents.length > 0 && connection.calendars.length > 0) {
      await rescheduleBotsForUpdatedEvents(
        connection.emailAccountId,
        updatedEvents,
        calendarId,
      );
    }
  } catch (error) {
    logger.error("Error fetching calendar events from Recall", {
      error,
      recallCalendarId: calendarId,
      connectionId: connection.id,
    });
  }
}

async function handleTranscriptDone(payload: TranscriptDoneEvent) {
  const botId = payload.data.bot.id;
  const transcriptId = payload.data.transcript.id;

  if (!botId || !transcriptId) {
    logger.warn("Missing bot ID or transcript ID in payload", {
      botId,
      transcriptId,
    });
    return;
  }

  try {
    const transcriptMetadata = await getTranscriptMetadata(transcriptId);

    const downloadUrl = transcriptMetadata.data?.download_url;
    if (!downloadUrl) {
      logger.error("No download URL found in transcript metadata", {
        transcriptId,
        metadata: transcriptMetadata,
      });
      return;
    }

    const transcriptData = await fetchTranscriptContent(downloadUrl);

    let transcriptContent: string;
    if (typeof transcriptData === "string") {
      transcriptContent = transcriptData;
    } else if (Array.isArray(transcriptData)) {
      transcriptContent = transcriptData
        .map(
          (segment: {
            participant?: {
              name?: string;
              id?: number;
              is_host?: boolean;
              platform?: string;
            };
            words?: Array<{
              text: string;
              start_timestamp?: { relative?: number; absolute?: string };
              end_timestamp?: { relative?: number; absolute?: string };
            }>;
          }) => {
            const participantName = segment?.participant?.name || "Unknown";
            const words = segment?.words || [];
            const text = words.map((word) => word.text).join(" ");
            return text ? `${participantName}: ${text}` : null;
          },
        )
        .filter(Boolean)
        .join("\n");
    } else if (transcriptData.transcript) {
      transcriptContent = transcriptData.transcript;
    } else if (transcriptData.content) {
      transcriptContent = transcriptData.content;
    } else {
      logger.warn("Unexpected transcript format", {
        transcriptId,
        hasArray: Array.isArray(transcriptData),
        keys: Object.keys(transcriptData),
      });
      transcriptContent = JSON.stringify(transcriptData);
    }

    const meeting = await prisma.recallMeeting.findUnique({
      where: { botId },
    });

    if (!meeting) {
      logger.warn("Meeting not found for transcript", {
        botId,
        transcriptId,
      });
      return;
    }

    await prisma.recallMeeting.update({
      where: { id: meeting.id },
      data: {
        transcript: transcriptContent,
        status: "COMPLETED",
      },
    });
  } catch (error) {
    logger.error("Error processing transcript", {
      error,
      botId,
      transcriptId,
    });
  }
}
