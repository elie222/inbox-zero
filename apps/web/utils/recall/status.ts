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
  // The bot being done only means it left the call. The transcript is produced
  // afterwards, so DONE is reserved for the point where we have actually stored
  // one; until then there is nothing for the user to read.
  done: MeetingRecordingStatus.CALL_ENDED,
  recording_permission_denied: MeetingRecordingStatus.FAILED,
  fatal: MeetingRecordingStatus.FAILED,
  // Carried by `recording.failed`. Leaving it unmapped strands the recording
  // in a live status until the 24-hour sweep and never tells the user anything
  // went wrong. `transcript.failed` carries it too but is filtered out in the
  // webhook route, because a failed transcription is retryable while the
  // recording itself is intact.
  failed: MeetingRecordingStatus.FAILED,
};

export function recallCodeToStatus(
  code: string,
): MeetingRecordingStatus | null {
  // Own-property check: a code like `constructor` would otherwise resolve an
  // inherited property and be treated as a real status.
  if (!Object.hasOwn(RECALL_CODE_TO_STATUS, code)) return null;
  return RECALL_CODE_TO_STATUS[code] ?? null;
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
