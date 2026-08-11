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

export const CANCELLABLE_STATUSES: MeetingRecordingStatus[] =
  LIVE_STATUSES.filter(
    (status) => status !== MeetingRecordingStatus.CALL_ENDED,
  );

// Once the bot is on its way to the call there is nothing useful left to change.
export const CHANGEABLE_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.PENDING,
  MeetingRecordingStatus.SCHEDULED,
];

// The bot is in the call with capture still underway. A recording still in one
// of these states after the meeting's scheduled end means the call ran long and
// the recording is wrapping up, not missing.
export const STILL_CAPTURING_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.IN_CALL,
  MeetingRecordingStatus.RECORDING,
];

// The bot engaged with the call (tried to join, or failed trying) but delivered
// no media. A recording still in one of these states after the meeting ended
// produced nothing.
export const NO_RECORDING_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.JOINING,
  MeetingRecordingStatus.IN_WAITING_ROOM,
  MeetingRecordingStatus.FAILED,
];

// The bot made it into the call, so media exists or is still being captured.
// Meetings in these states must never be presented as "not recorded".
export const CAPTURED_MEETING_STATUSES: MeetingRecordingStatus[] = [
  ...STILL_CAPTURING_STATUSES,
  MeetingRecordingStatus.CALL_ENDED,
  MeetingRecordingStatus.DONE,
];

// A booked bot is not a recorded meeting. The Recorded section only shows
// calls the bot engaged with or that produced media; untouched scheduled
// bookings are no-shows.
export const RECORDED_SECTION_STATUSES: MeetingRecordingStatus[] = [
  ...NO_RECORDING_STATUSES,
  ...CAPTURED_MEETING_STATUSES,
];

// Rank orders the lifecycle so replayed or out-of-order webhooks can only ever
// move a recording forwards.
const STATUS_RANK: Record<MeetingRecordingStatus, number> = {
  [MeetingRecordingStatus.PENDING]: 0,
  [MeetingRecordingStatus.SCHEDULED]: 1,
  [MeetingRecordingStatus.JOINING]: 2,
  [MeetingRecordingStatus.IN_WAITING_ROOM]: 3,
  [MeetingRecordingStatus.IN_CALL]: 4,
  [MeetingRecordingStatus.RECORDING]: 5,
  [MeetingRecordingStatus.CALL_ENDED]: 6,
  [MeetingRecordingStatus.CANCELLING]: 7,
  // Terminal outcomes: nothing may move a recording out of them. A late failure
  // event must not wipe a recording we already have a transcript for.
  [MeetingRecordingStatus.DONE]: 8,
  [MeetingRecordingStatus.FAILED]: 8,
  [MeetingRecordingStatus.CANCELLED]: 8,
};

const TERMINAL_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.DONE,
  MeetingRecordingStatus.FAILED,
  MeetingRecordingStatus.CANCELLED,
];

const LOCKED_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.CANCELLING,
  ...TERMINAL_STATUSES,
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

/**
 * Statuses a recording may currently be in for a move to `next` to be a step
 * forwards. Used as the `where` clause of a monotonic `updateMany`.
 */
export function getStatusesBelow(
  next: MeetingRecordingStatus,
): MeetingRecordingStatus[] {
  const nextRank = STATUS_RANK[next];

  return Object.values(MeetingRecordingStatus).filter(
    (status) =>
      STATUS_RANK[status] < nextRank && !LOCKED_STATUSES.includes(status),
  );
}
