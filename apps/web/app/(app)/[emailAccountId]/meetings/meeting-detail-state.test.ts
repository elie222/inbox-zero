import { describe, expect, it } from "vitest";
import {
  MeetingProcessingStatus,
  MeetingRecordingStatus,
} from "@/generated/prisma/enums";
import { getMeetingDetailState } from "@/app/(app)/[emailAccountId]/meetings/meeting-detail-state";

describe("getMeetingDetailState", () => {
  it("shows the notes once there is a summary", () => {
    expect(
      getMeetingDetailState({
        hasSummary: true,
        hasTranscript: true,
        recordingStatus: MeetingRecordingStatus.DONE,
        processingStatus: MeetingProcessingStatus.COMPLETED,
      }),
    ).toBe("notes");
  });

  it("shows a transcript while its summary is still being written", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: true,
        recordingStatus: MeetingRecordingStatus.DONE,
        processingStatus: MeetingProcessingStatus.PROCESSING,
      }),
    ).toBe("notes");
  });

  it("says the meeting has not been recorded before the call", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: false,
        recordingStatus: MeetingRecordingStatus.SCHEDULED,
        processingStatus: MeetingProcessingStatus.PENDING,
      }),
    ).toBe("not-recorded");
  });

  it("treats missing statuses as a meeting that has not been recorded", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: false,
        recordingStatus: undefined,
        processingStatus: undefined,
      }),
    ).toBe("not-recorded");
  });

  it("says the notes are coming while processing is still in flight", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: false,
        recordingStatus: MeetingRecordingStatus.DONE,
        processingStatus: MeetingProcessingStatus.PROCESSING,
      }),
    ).toBe("processing");
  });

  it("reports a failed recording", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: false,
        recordingStatus: MeetingRecordingStatus.FAILED,
        processingStatus: MeetingProcessingStatus.PENDING,
      }),
    ).toBe("recording-failed");
  });

  it("stops promising notes once processing has given up", () => {
    // Retries are capped, so FAILED here is terminal. Saying the notes are
    // still being written would leave the user waiting forever.
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: false,
        recordingStatus: MeetingRecordingStatus.DONE,
        processingStatus: MeetingProcessingStatus.FAILED,
      }),
    ).toBe("processing-failed");
  });

  it("surfaces a processing failure while keeping the transcript available", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: true,
        recordingStatus: MeetingRecordingStatus.DONE,
        processingStatus: MeetingProcessingStatus.FAILED,
      }),
    ).toBe("processing-failed");
  });

  it("stops promising notes after processing completes without content", () => {
    expect(
      getMeetingDetailState({
        hasSummary: false,
        hasTranscript: false,
        recordingStatus: MeetingRecordingStatus.DONE,
        processingStatus: MeetingProcessingStatus.COMPLETED,
      }),
    ).toBe("notes-unavailable");
  });
});
