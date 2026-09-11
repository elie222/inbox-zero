import type { NormalizedTranscript } from "@/utils/meeting-recorder/bot-provider";

const DEFAULT_MAX_CHARS = 120_000;
const TRUNCATION_NOTICE =
  "\n[Transcript truncated: the middle of this meeting was omitted to fit the context limit.]\n";

/**
 * Renders a transcript as speaker-labelled, timestamped lines. Hour-long calls
 * easily exceed the model's context, so when the transcript is too long we keep
 * the opening and the closing, which is where agreements and next steps land,
 * and drop the middle.
 */
export function transcriptToPromptText(
  transcript: NormalizedTranscript,
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  const lines = transcript.map(
    (utterance) =>
      `[${formatTranscriptTimestamp(utterance.startTime)}] ${
        utterance.speakerName
      }: ${utterance.text}`,
  );

  const full = lines.join("\n");
  if (full.length <= maxChars) return full;

  // Too small to say anything useful and still explain the truncation, so just
  // stay inside the limit rather than overflowing it with the notice.
  if (maxChars <= TRUNCATION_NOTICE.length) return full.slice(0, maxChars);

  const budget = maxChars - TRUNCATION_NOTICE.length;
  const headBudget = Math.floor(budget * 0.6);
  const tailBudget = budget - headBudget;

  return (
    takeLinesWithinBudget(lines, headBudget, "head") +
    TRUNCATION_NOTICE +
    takeLinesWithinBudget(lines, tailBudget, "tail")
  );
}

function takeLinesWithinBudget(
  lines: string[],
  budget: number,
  from: "head" | "tail",
): string {
  const ordered = from === "head" ? lines : [...lines].reverse();
  const taken: string[] = [];
  let used = 0;

  for (const line of ordered) {
    const cost = line.length + 1;
    if (used + cost > budget) {
      const remaining = budget - used;
      if (taken.length === 0 && remaining > 0) {
        taken.push(
          from === "head" ? line.slice(0, remaining) : line.slice(-remaining),
        );
      }
      break;
    }
    taken.push(line);
    used += cost;
  }

  return (from === "head" ? taken : taken.reverse()).join("\n");
}

/** Seconds from the start of the recording, as `mm:ss`. */
export function formatTranscriptTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
