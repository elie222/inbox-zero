import type { MeetingRecording } from "@/generated/prisma/client";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createMeetingBotProvider } from "@/utils/meeting-recorder/create-bot-provider";
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
