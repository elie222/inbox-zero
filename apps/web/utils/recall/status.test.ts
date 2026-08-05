import { describe, expect, it } from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import {
  interpretRecallWebhook,
  recallCodeToStatus,
} from "@/utils/recall/status";

describe("recallCodeToStatus", () => {
  it("maps known lifecycle codes and ignores unknown ones", () => {
    expect(recallCodeToStatus("in_call_recording")).toBe(
      MeetingRecordingStatus.RECORDING,
    );
    expect(recallCodeToStatus("recording_permission_denied")).toBe(
      MeetingRecordingStatus.FAILED,
    );
    expect(recallCodeToStatus("some_future_code")).toBeNull();
    // `recording.failed` and `transcript.failed` both carry code "failed".
    // Leaving it unmapped strands the recording in a live status until the
    // 24-hour sweep, and hides the failure from the user entirely.
    expect(recallCodeToStatus("failed")).toBe(MeetingRecordingStatus.FAILED);
    // Inherited properties are not statuses.
    expect(recallCodeToStatus("constructor")).toBeNull();
    expect(recallCodeToStatus("toString")).toBeNull();
  });
});

describe("interpretRecallWebhook", () => {
  it("routes a finished transcript to the transcript handler", () => {
    expect(
      interpretRecallWebhook({
        event: "transcript.done",
        data: { bot: { id: "bot-1" }, transcript: { id: "transcript-1" } },
      }),
    ).toEqual({
      type: "transcriptReady",
      externalBotId: "bot-1",
      externalTranscriptId: "transcript-1",
    });
  });

  it("routes a finished recording to the recording handler", () => {
    expect(
      interpretRecallWebhook({
        event: "recording.done",
        data: { bot: { id: "bot-1" }, recording: { id: "recording-1" } },
      }),
    ).toEqual({
      type: "recordingReady",
      externalBotId: "bot-1",
      externalRecordingId: "recording-1",
    });
  });

  it("does not fail the recording when only transcription failed", () => {
    // The generic "failed" code would otherwise map to a terminal FAILED
    // status and permanently lose a recorded meeting the sweep can recover.
    expect(
      interpretRecallWebhook({
        event: "transcript.failed",
        data: { bot: { id: "bot-1" }, data: { code: "failed" } },
      }),
    ).toMatchObject({ type: "ignore" });
  });

  it("fails the recording when the recording itself failed", () => {
    expect(
      interpretRecallWebhook({
        event: "recording.failed",
        data: { bot: { id: "bot-1" }, data: { code: "failed" } },
      }),
    ).toMatchObject({
      type: "statusChange",
      externalBotId: "bot-1",
      status: MeetingRecordingStatus.FAILED,
    });
  });

  it("maps a fatal event with a human readable failure reason", () => {
    const interpretation = interpretRecallWebhook({
      event: "bot.fatal",
      data: {
        bot: { id: "bot-1" },
        data: { code: "fatal", sub_code: "recording_permission_denied" },
      },
    });

    expect(interpretation).toMatchObject({
      type: "statusChange",
      status: MeetingRecordingStatus.FAILED,
    });
    if (interpretation.type !== "statusChange") throw new Error("unreachable");
    expect(interpretation.failureReason).toMatch(/declined/i);
    // A fatal event after the bot recorded must not fail a recording whose
    // media may still be recoverable.
    expect(interpretation.fromStatuses).not.toContain(
      MeetingRecordingStatus.RECORDING,
    );
    expect(interpretation.fromStatuses).not.toContain(
      MeetingRecordingStatus.CALL_ENDED,
    );
  });

  it.each([
    "meeting_not_started",
    "timeout_exceeded_only_bot_detected",
  ])("classifies the no-show outcome %s as cancelled", (subCode) => {
    expect(
      interpretRecallWebhook({
        event: "bot.fatal",
        data: {
          bot: { id: "bot-1" },
          data: { code: "fatal", sub_code: subCode },
        },
      }),
    ).toMatchObject({
      type: "statusChange",
      status: MeetingRecordingStatus.CANCELLED,
    });
  });

  it("falls back to the event name when the payload carries no code", () => {
    expect(
      interpretRecallWebhook({
        event: "bot.done",
        data: { bot: { id: "bot-1" } },
      }),
    ).toMatchObject({
      type: "statusChange",
      status: MeetingRecordingStatus.CALL_ENDED,
    });
  });

  it("ignores payloads it cannot act on", () => {
    expect(
      interpretRecallWebhook({ event: "bot.done", data: {} }),
    ).toMatchObject({ type: "ignore" });
    expect(
      interpretRecallWebhook({
        event: "transcript.done",
        data: { bot: { id: "bot-1" } },
      }),
    ).toMatchObject({ type: "ignore" });
    expect(
      interpretRecallWebhook({
        event: "recording.done",
        data: { bot: { id: "bot-1" } },
      }),
    ).toMatchObject({ type: "ignore" });
    expect(
      interpretRecallWebhook({
        event: "bot.some_future_code",
        data: { bot: { id: "bot-1" } },
      }),
    ).toMatchObject({ type: "ignore" });
  });
});
