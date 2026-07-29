import type { MeetingRecorderProcessBody } from "@/app/api/meeting-recorder/process/validation";
import type { MeetingRecorderTranscriptBody } from "@/app/api/meeting-recorder/transcript/validation";
import type { Logger } from "@/utils/logger";
import { MEETING_RECORDER_MIN_TIER } from "@/utils/meeting-recorder/config";
import { getPremiumUserFilter } from "@/utils/premium";
import prisma from "@/utils/prisma";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";

const MEETING_RECORDER_PROCESS_TOPIC = "meeting-recorder-process";
const MEETING_RECORDER_TRANSCRIPT_TOPIC = "meeting-recorder-transcript";

export async function enqueueTranscriptFetch({
  recordingId,
  logger,
}: {
  recordingId: string;
  logger: Logger;
}): Promise<void> {
  await enqueueBackgroundJob<MeetingRecorderTranscriptBody>({
    topic: MEETING_RECORDER_TRANSCRIPT_TOPIC,
    body: { recordingId },
    qstash: {
      queueName: MEETING_RECORDER_TRANSCRIPT_TOPIC,
      parallelism: 2,
      path: "/api/meeting-recorder/transcript",
    },
    logger,
  });
}

export async function enqueueMeetingProcessing({
  meetingId,
  logger,
}: {
  meetingId: string;
  logger: Logger;
}): Promise<void> {
  await enqueueBackgroundJob<MeetingRecorderProcessBody>({
    topic: MEETING_RECORDER_PROCESS_TOPIC,
    body: { meetingId },
    qstash: {
      queueName: MEETING_RECORDER_PROCESS_TOPIC,
      parallelism: 3,
      path: "/api/meeting-recorder/process",
    },
    logger,
  });
}

/** Queues processing for every eligible meeting linked to a recording. */
export async function enqueueProcessingForRecording({
  recordingId,
  logger,
}: {
  recordingId: string;
  logger: Logger;
}): Promise<void> {
  const meetings = await prisma.meeting.findMany({
    where: {
      recordingId,
      emailAccount: {
        meetingRecorderEnabled: true,
        ...getPremiumUserFilter({ minimumTier: MEETING_RECORDER_MIN_TIER }),
      },
    },
    select: { id: true },
  });

  logger.info("Queueing meeting summaries", { count: meetings.length });

  for (const meeting of meetings) {
    await enqueueMeetingProcessing({ meetingId: meeting.id, logger });
  }
}
