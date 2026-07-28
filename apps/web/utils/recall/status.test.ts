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
  });
});
