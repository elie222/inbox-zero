import type { MeetingRecording } from "@/generated/prisma/client";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createMeetingBotProvider } from "@/utils/meeting-recorder/create-bot-provider";
import { LIVE_STATUSES } from "@/utils/meeting-recorder/recording-lifecycle";
import prisma from "@/utils/prisma";

/**
 * We keep transcripts, never media. Best effort: a failure here leaves
 * `mediaDeletedAt` unset, which is what the cron sweep looks for, so the debt
 * is always retried rather than lost.
 */
export async function deleteRecordingMedia({
  recording,
  logger,
}: {
  recording: Pick<MeetingRecording, "id" | "botProvider" | "externalBotId">;
  logger: Logger;
}): Promise<void> {
  if (!recording.externalBotId) return;

  try {
    const provider = createMeetingBotProvider(recording.botProvider, logger);
    await provider.deleteMedia(recording.externalBotId);
    await prisma.meetingRecording.update({
      where: { id: recording.id },
      data: { mediaDeletedAt: new Date() },
    });
  } catch (error) {
    logger.error("Failed to delete meeting recording media", {
      recordingId: recording.id,
      error,
    });
    captureException(error);
  }
}

/**
 * Recording rows are the only record of where a bot and its media live, and
 * they cascade with the account. Provider errors propagate so the account is
 * not deleted while a bot could still join a call or media remains.
 */
export async function releaseAccountRecordings({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<void> {
  const recordings = await prisma.meetingRecording.findMany({
    where: {
      emailAccountId,
      mediaDeletedAt: null,
      externalBotId: { not: null },
    },
    select: { botProvider: true, externalBotId: true, status: true },
  });

  for (const { botProvider, externalBotId, status } of recordings) {
    if (!externalBotId) continue;

    const provider = createMeetingBotProvider(botProvider, logger);
    if (BOT_MAY_BE_ACTIVE_STATUSES.includes(status)) {
      await provider.cancelBot(externalBotId);
    }
    await provider.deleteMedia(externalBotId);
  }
}

const BOT_MAY_BE_ACTIVE_STATUSES: MeetingRecordingStatus[] = [
  ...LIVE_STATUSES,
  MeetingRecordingStatus.CANCELLING,
];
