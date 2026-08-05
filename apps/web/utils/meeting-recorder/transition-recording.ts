import type { MeetingRecordingStatus } from "@/generated/prisma/enums";
import {
  getStatusesBelow,
  recordingStatusData,
} from "@/utils/meeting-recorder/recording-lifecycle";
import prisma from "@/utils/prisma";

/**
 * Moves one recording to `next` only if that is a step forwards, so a
 * concurrent DONE or CANCELLING write can never be clobbered. The recording is
 * addressed either by id or by its provider identity (which is all a webhook
 * has). Returns the update count; zero means the recording had already moved
 * on.
 */
export function transitionRecording(
  params: (
    | { recordingId: string }
    | { botProvider: string; externalBotId: string }
  ) & {
    status: MeetingRecordingStatus;
    fromStatuses?: MeetingRecordingStatus[];
    data?: { failureReason?: string; transcriptFetchedAt?: Date };
  },
) {
  const selector =
    "recordingId" in params
      ? { id: params.recordingId }
      : {
          botProvider: params.botProvider,
          externalBotId: params.externalBotId,
        };

  return prisma.meetingRecording.updateMany({
    where: {
      ...selector,
      status: {
        in: params.fromStatuses ?? getStatusesBelow(params.status),
      },
    },
    data: { ...recordingStatusData(params.status), ...params.data },
  });
}
