import type { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createMeetingBotProvider } from "@/utils/meeting-recorder/create-bot-provider";
import { enqueueTranscriptFetch } from "@/utils/meeting-recorder/enqueue-processing";
import {
  LIVE_STATUSES,
  transitionRecording,
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
  fromStatuses,
  failureReason,
  logger,
}: {
  botProvider: string;
  externalBotId: string;
  status: MeetingRecordingStatus;
  fromStatuses?: MeetingRecordingStatus[];
  failureReason?: string;
  logger: Logger;
}): Promise<void> {
  const result = await transitionRecording({
    botProvider,
    externalBotId,
    status,
    fromStatuses,
    data: failureReason ? { failureReason } : undefined,
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
 * `transcriptRequestedAt` is the claim, so a redelivered event cannot ask for
 * the same recording twice and be billed twice. It is deliberately never
 * released on failure: a request that threw may still have been accepted, and
 * releasing would let a redelivery double-request. The stale-claim sweep is
 * what retries a request that genuinely never landed.
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
  const recording = await prisma.meetingRecording.findUnique({
    where: { botProvider_externalBotId: { botProvider, externalBotId } },
    select: { id: true, status: true },
  });

  // An unknown bot is not the same as an already-claimed one. It means we have
  // lost track of a recording we are paying for, which is worth alerting on.
  if (!recording) {
    logger.warn("Recording ready for an unknown bot", { externalBotId });
    captureException(new Error("Meeting recorder recording for unknown bot"), {
      extra: { botProvider, externalBotId },
    });
    return;
  }

  if (!LIVE_STATUSES.includes(recording.status)) {
    logger.info("Ignored recording ready event for a non-live recording", {
      recordingId: recording.id,
      status: recording.status,
    });
    return;
  }

  const claim = await prisma.meetingRecording.updateMany({
    where: {
      id: recording.id,
      status: { in: LIVE_STATUSES },
      transcriptRequestedAt: null,
    },
    data: { externalRecordingId, transcriptRequestedAt: new Date() },
  });

  if (claim.count === 0) {
    logger.info("Transcription already requested for this recording", {
      recordingId: recording.id,
    });
    return;
  }

  const provider = createMeetingBotProvider(botProvider, logger);
  await provider.createTranscript(externalRecordingId);

  logger.info("Requested transcription", { recordingId: recording.id });
}
