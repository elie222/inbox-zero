import {
  MeetingProcessingStatus,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";

export type MeetingDetailState =
  | "notes"
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
  if (hasSummary || hasTranscript) return "notes";
  if (recordingStatus === MeetingRecordingStatus.FAILED) {
    return "recording-failed";
  }
  if (recordingStatus !== MeetingRecordingStatus.DONE) return "not-recorded";

  // The recording is there but the notes are not. Processing retries are
  // capped, so FAILED is terminal: promising notes that will never arrive
  // leaves the user waiting forever.
  return processingStatus === MeetingProcessingStatus.FAILED
    ? "processing-failed"
    : "processing";
}
