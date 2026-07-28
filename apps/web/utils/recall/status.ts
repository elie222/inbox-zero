import { MeetingRecordingStatus } from "@/generated/prisma/enums";

// Recall status change events carry a `code` describing the bot's lifecycle.
// https://docs.recall.ai/docs/bot-status-change-events
const RECALL_CODE_TO_STATUS: Record<string, MeetingRecordingStatus> = {
  ready: MeetingRecordingStatus.SCHEDULED,
  joining_call: MeetingRecordingStatus.JOINING,
  in_waiting_room: MeetingRecordingStatus.IN_WAITING_ROOM,
  in_call_not_recording: MeetingRecordingStatus.IN_CALL,
  recording_permission_allowed: MeetingRecordingStatus.IN_CALL,
  in_call_recording: MeetingRecordingStatus.RECORDING,
  call_ended: MeetingRecordingStatus.CALL_ENDED,
  done: MeetingRecordingStatus.DONE,
  recording_permission_denied: MeetingRecordingStatus.FAILED,
  fatal: MeetingRecordingStatus.FAILED,
};

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
  // Terminal outcomes: nothing may move a recording out of them. A late failure
  // event must not wipe a recording we already have a transcript for.
  [MeetingRecordingStatus.DONE]: 7,
  [MeetingRecordingStatus.FAILED]: 7,
  [MeetingRecordingStatus.CANCELLED]: 7,
};

const TERMINAL_STATUSES: MeetingRecordingStatus[] = [
  MeetingRecordingStatus.DONE,
  MeetingRecordingStatus.FAILED,
  MeetingRecordingStatus.CANCELLED,
];

export function recallCodeToStatus(
  code: string,
): MeetingRecordingStatus | null {
  return RECALL_CODE_TO_STATUS[code] ?? null;
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
      STATUS_RANK[status] < nextRank && !TERMINAL_STATUSES.includes(status),
  );
}

// Copy shown to the user for the failure sub-codes we expect to see in practice.
// Everything else falls back to the raw sub-code so support can still triage it.
const SUB_CODE_MESSAGES: Record<string, string> = {
  recording_permission_denied: "The host declined the recording request.",
  bot_kicked_from_call: "The notetaker was removed from the call.",
  bot_kicked_from_waiting_room:
    "The notetaker was not admitted from the waiting room.",
  timeout_exceeded_waiting_room:
    "The notetaker waited in the waiting room but was never admitted.",
  timeout_exceeded_only_bot_detected:
    "The notetaker was the only participant, so it left the call.",
  timeout_exceeded_everyone_left: "Everyone left the call before it started.",
  timeout_exceeded_in_call_not_recording:
    "The notetaker joined but was never allowed to record.",
  meeting_not_started: "The meeting never started.",
  meeting_link_expired: "The meeting link had expired.",
  meeting_link_invalid: "The meeting link was not valid.",
  meeting_locked: "The meeting was locked, so the notetaker could not join.",
  meeting_full: "The meeting was full, so the notetaker could not join.",
  meeting_requires_sign_in:
    "The meeting required a signed-in account, so the notetaker could not join.",
};

export function getFailureReason(subCode: string | null | undefined): string {
  if (!subCode) return "The notetaker could not record this meeting.";
  return SUB_CODE_MESSAGES[subCode] ?? `The notetaker failed: ${subCode}`;
}
