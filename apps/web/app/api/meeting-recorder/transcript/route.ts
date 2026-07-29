import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { createMeetingBotProvider } from "@/utils/meeting-recorder/create-bot-provider";
import { deleteRecordingMedia } from "@/utils/meeting-recorder/delete-media";
import { enqueueProcessingForRecording } from "@/utils/meeting-recorder/enqueue-processing";
import {
  getStatusesBelow,
  recordingStatusData,
} from "@/utils/meeting-recorder/recording-lifecycle";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { withQstashOrInternal } from "@/utils/qstash";
import { meetingRecorderTranscriptBody } from "./validation";

export const maxDuration = 300;

export const POST = withError(
  "meeting-recorder/transcript",
  withQstashOrInternal(async (request) => {
    const { recordingId } = meetingRecorderTranscriptBody.parse(
      await request.json(),
    );
    const logger = request.logger.with({ recordingId });

    await storeTranscript({ recordingId, logger });

    return NextResponse.json({ ok: true });
  }),
);

async function storeTranscript({
  recordingId,
  logger,
}: {
  recordingId: string;
  logger: Logger;
}): Promise<void> {
  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording) {
    logger.error("Recording not found");
    return;
  }

  // The stored transcript is the real completion marker. Keying the fan-out off
  // it means a redelivery after a crash re-runs only the step that did not
  // finish, rather than skipping the rest of the job.
  if (!recording.transcript) {
    if (!recording.externalTranscriptId) {
      logger.error("Recording has no transcript to fetch");
      return;
    }

    // Claim the download so two deliveries cannot fetch and write in parallel.
    const claim = await prisma.meetingRecording.updateMany({
      where: { id: recordingId, transcriptFetchedAt: null },
      data: { transcriptFetchedAt: new Date() },
    });
    if (claim.count === 0) {
      logger.info("Transcript download already in flight");
      return;
    }

    const provider = createMeetingBotProvider(recording.botProvider, logger);

    try {
      const transcript = await provider.fetchTranscript(
        recording.externalTranscriptId,
      );

      // Store the transcript unconditionally, but only advance the status from
      // a non-terminal one: a late transcript must not revive a recording that
      // already failed or was cancelled.
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: {
          // Prisma's JSON input type rejects optional properties even though the
          // transcript is plain JSON-safe data.
          transcript: transcript as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Release the claim so the queue retry can try the download again.
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { transcriptFetchedAt: null },
      });
      throw error;
    }
  }

  await prisma.meetingRecording.updateMany({
    where: {
      id: recording.id,
      status: { in: getStatusesBelow(MeetingRecordingStatus.DONE) },
    },
    data: {
      ...recordingStatusData(MeetingRecordingStatus.DONE),
      transcriptFetchedAt: new Date(),
    },
  });

  if (!recording.mediaDeletedAt) {
    await deleteRecordingMedia({ recording, logger });
  }

  await enqueueProcessingForRecording({ recordingId: recording.id, logger });
}
