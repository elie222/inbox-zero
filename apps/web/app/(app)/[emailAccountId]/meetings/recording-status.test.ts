import { describe, expect, it } from "vitest";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { getRecordingStatusBadge } from "@/app/(app)/[emailAccountId]/meetings/recording-status";

const NOW = new Date("2026-07-30T17:15:00.000Z");

describe("getRecordingStatusBadge", () => {
  it("makes it clear when an ongoing call is still waiting for the bot", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.SCHEDULED,
        startTime: new Date("2026-07-30T17:00:00.000Z"),
        endTime: new Date("2026-07-30T17:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Waiting to join", variant: "secondary" });
  });

  it("shows when the calendar event is in progress before a bot status exists", () => {
    expect(
      getRecordingStatusBadge({
        status: undefined,
        startTime: new Date("2026-07-30T17:00:00.000Z"),
        endTime: new Date("2026-07-30T17:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Call in progress", variant: "secondary" });
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

  it.each([
    [
      MeetingRecordingStatus.IN_CALL,
      { label: "Notetaker joined", variant: "default" },
    ],
    [
      MeetingRecordingStatus.RECORDING,
      { label: "Recording", variant: "green" },
    ],
  ] as const)("uses the bot status after the scheduled end while capture is still in progress (%s)", (status, expectedBadge) => {
    expect(
      getRecordingStatusBadge({
        status,
        startTime: new Date("2026-07-30T16:00:00.000Z"),
        endTime: new Date("2026-07-30T16:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual(expectedBadge);
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

  it("shows when the notetaker has joined the call", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.IN_CALL,
        startTime: new Date("2026-07-30T17:00:00.000Z"),
        endTime: new Date("2026-07-30T17:30:00.000Z"),
        now: NOW,
      }),
    ).toEqual({ label: "Notetaker joined", variant: "default" });
  });

  it("hides a past booking the recorder never engaged with", () => {
    expect(
      getRecordingStatusBadge({
        status: MeetingRecordingStatus.SCHEDULED,
        startTime: new Date("2026-07-30T16:00:00.000Z"),
        endTime: new Date("2026-07-30T16:30:00.000Z"),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("shows no badge for a past meeting without a recording", () => {
    expect(
      getRecordingStatusBadge({
        status: undefined,
        startTime: new Date("2026-07-30T16:00:00.000Z"),
        endTime: new Date("2026-07-30T16:30:00.000Z"),
        now: NOW,
      }),
    ).toBeNull();
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
