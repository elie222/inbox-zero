import { describe, expect, it } from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { getStatusesBelow, recallCodeToStatus } from "@/utils/recall/status";

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

describe("getStatusesBelow", () => {
  it("only allows a recording to move forwards", () => {
    const below = getStatusesBelow(MeetingRecordingStatus.RECORDING);

    expect(below).toContain(MeetingRecordingStatus.JOINING);
    expect(below).toContain(MeetingRecordingStatus.IN_CALL);
    expect(below).not.toContain(MeetingRecordingStatus.RECORDING);
    expect(below).not.toContain(MeetingRecordingStatus.DONE);
  });

  it("never lets a terminal recording be reopened", () => {
    for (const status of Object.values(MeetingRecordingStatus)) {
      const below = getStatusesBelow(status);
      expect(below).not.toContain(MeetingRecordingStatus.DONE);
      expect(below).not.toContain(MeetingRecordingStatus.FAILED);
      expect(below).not.toContain(MeetingRecordingStatus.CANCELLED);
    }
  });

  it("lets a late failure overwrite an in-progress status but not a finished one", () => {
    const below = getStatusesBelow(MeetingRecordingStatus.FAILED);

    expect(below).toContain(MeetingRecordingStatus.PENDING);
    expect(below).toContain(MeetingRecordingStatus.RECORDING);
    expect(below).not.toContain(MeetingRecordingStatus.DONE);
  });
});
