import { describe, expect, it } from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { recallCodeToStatus } from "@/utils/recall/status";

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
