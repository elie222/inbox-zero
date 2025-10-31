import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { verifySvixWebhook } from "@/utils/recall/verify-svix-webhook";
import { rescheduleBotsForUpdatedEvents } from "@/utils/recall/bot";
import type { CalendarEvent } from "./types";
import {
  getRecallCalendar,
  deleteRecallCalendar,
  fetchCalendarEvents,
} from "@/utils/recall/calendar";
import {
  createAsyncTranscript,
  getTranscriptMetadata,
  fetchTranscriptContent,
} from "@/utils/recall/transcript";
import type {
  RecallWebhookPayload,
  CalendarUpdateEvent,
  CalendarSyncEventsEvent,
  RecordingDoneEvent,
  TranscriptDoneEvent,
} from "./types";
import { z } from "zod";
import { MeetingStatus } from "@prisma/client";

const logger = createScopedLogger("recall/webhook");

const calendarUpdateSchema = z.object({
  event: z.literal("calendar.update"),
  data: z.object({
    calendar_id: z.string(),
  }),
});

const calendarSyncEventsSchema = z.object({
  event: z.literal("calendar.sync_events"),
  data: z.object({
    calendar_id: z.string(),
    last_updated_ts: z.string(),
  }),
});

const recordingDoneSchema = z.object({
  event: z.literal("recording.done"),
  data: z.object({
    data: z.object({
      code: z.string(),
      sub_code: z.string().nullable(),
      updated_at: z.string(),
    }),
    bot: z.object({
      id: z.string(),
      metadata: z.unknown(),
    }),
    recording: z.object({
      id: z.string(),
      metadata: z.unknown(),
    }),
  }),
});

const transcriptDoneSchema = z.object({
  event: z.literal("transcript.done"),
  data: z.object({
    data: z.object({
      code: z.string(),
      sub_code: z.string().nullable(),
      updated_at: z.string(),
    }),
    bot: z.object({
      id: z.string(),
      metadata: z.unknown(),
    }),
    transcript: z.object({
      id: z.string(),
      metadata: z.unknown(),
    }),
    recording: z.object({
      id: z.string(),
      metadata: z.unknown(),
    }),
  }),
});

const recallWebhookSchema = z.union([
  calendarUpdateSchema,
  calendarSyncEventsSchema,
  recordingDoneSchema,
  transcriptDoneSchema,
]);

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

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const parsed = recallWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid payload", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data as RecallWebhookPayload;
  const eventType = body.event;

  try {
    return await processRecallWebhook(body);
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

async function processRecallWebhook(
  payload: RecallWebhookPayload,
): Promise<NextResponse> {
  const eventType = payload.event;

  switch (eventType) {
    case "calendar.sync_events":
      await handleCalendarSyncEvents(payload as CalendarSyncEventsEvent);
      return NextResponse.json({
        message: "Calendar sync events processed successfully",
      });
    case "calendar.update":
      await handleCalendarUpdate(payload as CalendarUpdateEvent);
      return NextResponse.json({
        message: "Calendar update processed successfully",
      });
    case "recording.done":
      await handleRecordingDone(payload as RecordingDoneEvent);
      return NextResponse.json({
        message: "Recording done processed successfully",
      });
    case "transcript.done":
      await handleTranscriptDone(payload as TranscriptDoneEvent);
      return NextResponse.json({
        message: "Transcript done processed successfully",
      });
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

        await prisma.meeting.updateMany({
          where: {
            emailAccountId: connection.emailAccountId,
            status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.ACTIVE] },
          },
          data: { status: MeetingStatus.CANCELLED },
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

async function handleRecordingDone(payload: RecordingDoneEvent) {
  const recordingId = payload.data.recording.id;
  const botId = payload.data.bot?.id;

  logger.info("Recording completed", {
    recordingId,
    botId,
  });

  if (!botId) {
    logger.warn("Missing bot ID in recording.done payload", {
      recordingId,
    });
    return;
  }

  try {
    const meeting = await prisma.meeting.findUnique({
      where: { botId },
    });

    if (!meeting) {
      logger.warn("Meeting not found for recording", {
        botId,
        recordingId,
      });
      return;
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { status: MeetingStatus.ACTIVE },
    });

    const transcript = await createAsyncTranscript(recordingId, {
      language: "en",
      provider: {
        recallai_async: {
          model: "whisper-1",
        },
      },
    });

    logger.info("Async transcript created successfully", {
      meetingId: meeting.id,
      botId,
      recordingId,
      transcriptId: transcript.id,
    });
  } catch (error) {
    logger.error("Error processing recording.done webhook", {
      error,
      botId,
      recordingId,
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

    let parsedTranscriptData = transcriptData;
    if (
      typeof transcriptData === "string" &&
      transcriptData.trim().startsWith("[")
    ) {
      try {
        parsedTranscriptData = JSON.parse(transcriptData);
      } catch (error) {
        logger.warn("Failed to parse stringified JSON transcript", {
          botId,
          transcriptId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const meeting = await prisma.meeting.findUnique({
      where: { botId },
    });

    if (!meeting) {
      logger.warn("Meeting not found for transcript", {
        botId,
        transcriptId,
      });
      return;
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        transcript: parsedTranscriptData as Prisma.InputJsonValue,
        status: MeetingStatus.COMPLETED,
      },
    });

    logger.info("Transcript processing completed successfully", {
      meetingId: meeting.id,
      eventId: meeting.eventId,
      botId,
      transcriptId,
    });
  } catch (error) {
    logger.error("Error processing transcript", {
      error,
      botId,
      transcriptId,
    });
  }
}
