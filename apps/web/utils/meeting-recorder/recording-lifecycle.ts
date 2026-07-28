import { MeetingRecordingStatus } from "@/generated/prisma/enums";

// A recording that has not reached a terminal state yet and could still be
// scheduled, rescheduled or cancelled.
export const LIVE_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.PENDING,
  MeetingRecordingStatus.SCHEDULED,
  MeetingRecordingStatus.JOINING,
  MeetingRecordingStatus.IN_WAITING_ROOM,
  MeetingRecordingStatus.IN_CALL,
  MeetingRecordingStatus.RECORDING,
  MeetingRecordingStatus.CALL_ENDED,
];

// Once the bot is on its way to the call there is nothing useful left to change.
export const CHANGEABLE_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.PENDING,
  MeetingRecordingStatus.SCHEDULED,
];

const TERMINAL_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.DONE,
  MeetingRecordingStatus.FAILED,
  MeetingRecordingStatus.CANCELLED,
];

/**
 * The fields a status change must write. Reaching a terminal state clears
 * `activeKey`, releasing the dedup slot the row was holding so the same meeting
 * can be booked again after it was cancelled or failed. Every status write goes
 * through here rather than setting `status` on its own.
 */
export function recordingStatusData(status: MeetingRecordingStatus) {
  return TERMINAL_STATUSES.includes(status)
    ? { status, activeKey: null }
    : { status };
}
