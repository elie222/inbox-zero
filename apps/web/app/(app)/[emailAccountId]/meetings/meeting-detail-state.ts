import {
  MeetingProcessingStatus,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";

export type MeetingDetailState =
  | "notes"
  | "notes-unavailable"
  | "not-recorded"
  | "processing"
  | "processing-failed"
  | "recording-failed";

/**
 * What the meeting dialog should show. A meeting is listed as soon as a bot is
 * booked, so the dialog opens long before there is anything to read, and both
 * the recording and the summarization can fail independently.
 */
export function getMeetingDetailState({
  hasSummary,
  hasTranscript,
  recordingStatus,
  processingStatus,
}: {
  hasSummary: boolean;
  hasTranscript: boolean;
  recordingStatus: MeetingRecordingStatus | undefined;
  processingStatus: MeetingProcessingStatus | undefined;
}): MeetingDetailState {
  if (hasSummary) return "notes";
  if (recordingStatus === MeetingRecordingStatus.FAILED) {
    return "recording-failed";
  }
  if (processingStatus === MeetingProcessingStatus.FAILED) {
    return "processing-failed";
  }
  if (processingStatus === MeetingProcessingStatus.COMPLETED) {
    return "notes-unavailable";
  }
  if (hasTranscript) return "notes";

  // Once the bot is in the call, the meeting is being captured even though
  // there is nothing to read yet, so "not recorded" would be wrong.
  if (
    recordingStatus === MeetingRecordingStatus.IN_CALL ||
    recordingStatus === MeetingRecordingStatus.RECORDING ||
    recordingStatus === MeetingRecordingStatus.CALL_ENDED ||
    recordingStatus === MeetingRecordingStatus.DONE
  ) {
    return "processing";
  }

  return "not-recorded";
}
