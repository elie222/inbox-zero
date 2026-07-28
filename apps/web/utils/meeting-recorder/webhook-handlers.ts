import type { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createMeetingBotProvider } from "@/utils/meeting-recorder/create-bot-provider";
import { enqueueTranscriptFetch } from "@/utils/meeting-recorder/enqueue-processing";
import {
  getStatusesBelow,
  recordingStatusData,
} from "@/utils/meeting-recorder/recording-lifecycle";
import prisma from "@/utils/prisma";

/**
 * Provider-agnostic handlers that each bot provider's webhook route translates
 * into. Providers deliver at-least-once and out of order, so both handlers are
 * idempotent and never move a recording backwards.
 */
export async function handleBotStatusChange({
  botProvider,
  externalBotId,
  status,
  failureReason,
  logger,
}: {
  botProvider: string;
  externalBotId: string;
  status: MeetingRecordingStatus;
  failureReason?: string;
  logger: Logger;
}): Promise<void> {
  const result = await prisma.meetingRecording.updateMany({
    where: {
      botProvider,
      externalBotId,
      status: { in: getStatusesBelow(status) },
    },
    data: {
      ...recordingStatusData(status),
      ...(failureReason ? { failureReason } : {}),
    },
  });

  if (result.count === 0) {
    logger.info("Ignored meeting bot status change", {
      externalBotId,
      status,
    });
    return;
  }

  logger.info("Updated meeting recording status", { externalBotId, status });
}

export async function handleTranscriptReady({
  botProvider,
  externalBotId,
  externalTranscriptId,
  logger,
}: {
  botProvider: string;
  externalBotId: string;
  externalTranscriptId: string;
  logger: Logger;
}): Promise<void> {
  const recording = await prisma.meetingRecording.findUnique({
    where: { botProvider_externalBotId: { botProvider, externalBotId } },
    select: { id: true, transcriptFetchedAt: true },
  });

  if (!recording) {
    logger.warn("Transcript ready for an unknown bot", { externalBotId });
    captureException(new Error("Meeting recorder transcript for unknown bot"), {
      extra: { botProvider, externalBotId },
    });
    return;
  }

  if (recording.transcriptFetchedAt) {
    logger.info("Transcript already stored", { recordingId: recording.id });
    return;
  }

  await prisma.meetingRecording.update({
    where: { id: recording.id },
    data: { externalTranscriptId },
  });

  await enqueueTranscriptFetch({ recordingId: recording.id, logger });
}

/**
 * The recording is finished and can be transcribed. Providers that transcribe
 * asynchronously need to be asked to start, which is a separate call from
 * scheduling the bot.
 *
 * Claimed on `externalRecordingId` so a redelivered event cannot ask for the
 * same recording to be transcribed twice, which would bill twice and produce
 * two `transcript.done` events.
 */
export async function handleRecordingReady({
  botProvider,
  externalBotId,
  externalRecordingId,
  logger,
}: {
  botProvider: string;
  externalBotId: string;
  externalRecordingId: string;
  logger: Logger;
}): Promise<void> {
  const claim = await prisma.meetingRecording.updateMany({
    where: {
      botProvider,
      externalBotId,
      externalRecordingId: null,
    },
    data: { externalRecordingId },
  });

  if (claim.count === 0) {
    logger.info("Transcription already requested for this recording", {
      externalBotId,
    });
    return;
  }

  try {
    const provider = createMeetingBotProvider(botProvider, logger);
    await provider.createTranscript(externalRecordingId);
    logger.info("Requested transcription", { externalBotId });
  } catch (error) {
    // Release the claim so the redelivery retries rather than silently
    // leaving a recording that is never transcribed.
    await prisma.meetingRecording.updateMany({
      where: { botProvider, externalBotId, externalRecordingId },
      data: { externalRecordingId: null },
    });
    throw error;
  }
}
