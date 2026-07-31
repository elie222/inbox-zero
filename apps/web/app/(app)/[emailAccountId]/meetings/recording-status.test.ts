import { describe, expect, it } from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { getRecordingStatusBadge } from "@/app/(app)/[emailAccountId]/meetings/recording-status";

const NOW = new Date("2026-07-30T17:15:00.000Z");

describe("getRecordingStatusBadge", () => {
  it("shows an ongoing meeting from its time range even while the recorder status is stale", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.SCHEDULED,
        startTime: new Date("2026-07-30T17:00:00.000Z"),
        endTime: new Date("2026-07-30T17:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Ongoing", variant: "green" });
  });

  it("shows that an ended meeting has no recording when capture failed", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.FAILED,
        startTime: new Date("2026-07-30T16:00:00.000Z"),
        endTime: new Date("2026-07-30T16:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Not recorded", variant: "red" });
  });

  it("keeps actionable recorder progress visible while the meeting is ongoing", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.IN_WAITING_ROOM,
        startTime: new Date("2026-07-30T17:00:00.000Z"),
        endTime: new Date("2026-07-30T17:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Waiting to be let in", variant: "default" });
  });

  it("keeps a future booked meeting scheduled", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.SCHEDULED,
        startTime: new Date("2026-07-30T18:00:00.000Z"),
        endTime: new Date("2026-07-30T18:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Scheduled", variant: "secondary" });
  });
});
