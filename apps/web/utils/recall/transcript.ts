import type { NormalizedTranscript } from "@/utils/meeting-recorder/bot-provider";
import type { RecallTranscriptDownload } from "@/utils/recall/types";

const UNKNOWN_SPEAKER = "Unknown speaker";

/**
 * Collapses Recall's per-word transcript into one utterance per participant
 * turn. Consecutive turns by the same speaker are merged so the transcript
 * reads as speech rather than as a word stream.
 */
export function normalizeRecallTranscript(
  download: RecallTranscriptDownload,
): NormalizedTranscript {
  const utterances: NormalizedTranscript = [];

  for (const turn of download) {
    const text = turn.words
      .map((word) => word.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) continue;

    const speakerName = turn.participant.name?.trim() || UNKNOWN_SPEAKER;
    const startTime = turn.words[0]?.start_timestamp?.relative ?? 0;
    const endTime = turn.words.at(-1)?.end_timestamp?.relative ?? startTime;

    const previous = utterances.at(-1);
    if (
      previous &&
      previous.speakerName === speakerName &&
      previous.email === (turn.participant.email ?? undefined)
    ) {
      previous.text = `${previous.text} ${text}`;
      previous.endTime = endTime;
      continue;
    }

    utterances.push({
      speakerName,
      isHost: turn.participant.is_host ?? false,
      email: turn.participant.email ?? undefined,
      startTime,
      endTime,
      text,
    });
  }

  return utterances;
}
