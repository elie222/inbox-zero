import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

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

export const CANCELLABLE_STATUSES = LIVE_STATUSES.filter(
  (status) => status !== MeetingRecordingStatus.CALL_ENDED,
);

// Once the bot is on its way to the call there is nothing useful left to change.
export const CHANGEABLE_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.PENDING,
  MeetingRecordingStatus.SCHEDULED,
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
 * Moves one recording to `next` only if that is a step forwards, so a
 * concurrent DONE or CANCELLING write can never be clobbered. Returns the
 * update count; zero means the recording had already moved on.
 */
export function transitionRecording({
  recordingId,
  status,
  data,
}: {
  recordingId: string;
  status: MeetingRecordingStatus;
  data?: { failureReason?: string };
}) {
  return prisma.meetingRecording.updateMany({
    where: { id: recordingId, status: { in: getStatusesBelow(status) } },
    data: { ...recordingStatusData(status), ...data },
  });
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
