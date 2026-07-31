import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { getStatusesBelow } from "@/utils/meeting-recorder/recording-lifecycle";
import type { RecallWebhookPayload } from "@/utils/recall/types";

type RecallWebhookInterpretation =
  | {
      type: "transcriptReady";
      externalBotId: string;
      externalTranscriptId: string;
    }
  | {
      type: "recordingReady";
      externalBotId: string;
      externalRecordingId: string;
    }
  | {
      type: "statusChange";
      externalBotId: string;
      status: MeetingRecordingStatus;
      fromStatuses?: MeetingRecordingStatus[];
      failureReason?: string;
    }
  | { type: "ignore"; reason: string };

/**
 * Translates a verified Recall webhook payload into the provider-agnostic
 * action it calls for. All Recall payload semantics live here, so the webhook
 * route only verifies, parses and dispatches.
 */
export function interpretRecallWebhook(
  payload: RecallWebhookPayload,
): RecallWebhookInterpretation {
  const externalBotId = payload.data.bot?.id;
  if (!externalBotId) {
    return { type: "ignore", reason: "Webhook carries no bot id" };
  }

  if (payload.event === "transcript.done") {
    const externalTranscriptId = payload.data.transcript?.id;
    if (!externalTranscriptId) {
      return {
        type: "ignore",
        reason: "Transcript event carries no transcript id",
      };
    }
    return { type: "transcriptReady", externalBotId, externalTranscriptId };
  }

  // A failed transcription is often retryable on the provider side while the
  // recording itself is fine, but its generic code would read as a terminal
  // bot failure and permanently lose a recorded meeting. Leaving the row in
  // its live status lets the stuck-transcript sweep re-request transcription;
  // if that never succeeds, the abandoned sweep eventually fails the row.
  if (payload.event === "transcript.failed") {
    return {
      type: "ignore",
      reason: "Transcription failed, leaving it for the retry sweep",
    };
  }

  // The recording being ready is what starts async transcription; the bot
  // finishing does not. Without this the transcript is never produced.
  if (payload.event === "recording.done") {
    const externalRecordingId = payload.data.recording?.id;
    if (!externalRecordingId) {
      return {
        type: "ignore",
        reason: "Recording event carries no recording id",
      };
    }
    return { type: "recordingReady", externalBotId, externalRecordingId };
  }

  // Recall sends the lifecycle code in the payload, but the event name carries
  // the same information (`bot.done`, `bot.fatal`) as a fallback.
  const code = payload.data.data?.code ?? payload.event.split(".").at(-1);
  const status = code ? recallCodeToStatus(code) : null;
  if (!status) {
    return { type: "ignore", reason: `Unmapped Recall status code: ${code}` };
  }

  return {
    type: "statusChange",
    externalBotId,
    status,
    // A fatal event after the bot recorded is often a delivery hiccup rather
    // than a lost meeting, so it must not fail a recording whose media may
    // still be recoverable.
    fromStatuses:
      code === "fatal"
        ? getStatusesBelow(MeetingRecordingStatus.RECORDING)
        : undefined,
    failureReason:
      status === MeetingRecordingStatus.FAILED
        ? getFailureReason(payload.data.data?.sub_code)
        : undefined,
  };
}

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
