export type TranscriptFragment = {
  speaker: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
};

export type TranscriptTurn = {
  speaker: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
};

export function appendTranscriptDelta(
  fragments: TranscriptFragment[],
  speaker: TranscriptFragment["speaker"],
  delta: string,
  startMs: number,
  endMs: number,
): TranscriptFragment[] {
  if (delta === "") return fragments;
  return [
    ...fragments,
    {
      speaker,
      text: delta,
      startMs: Number.isFinite(startMs) ? startMs : 0,
      endMs: Number.isFinite(endMs) ? Math.max(endMs, startMs) : startMs,
    },
  ];
}

export function groupTranscriptTurns(
  fragments: TranscriptFragment[],
  gapMs = 900,
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const fragment of fragments) {
    const prev = turns[turns.length - 1];
    if (
      prev &&
      prev.speaker === fragment.speaker &&
      fragment.startMs - prev.endMs <= gapMs
    ) {
      prev.text += fragment.text;
      prev.endMs = Math.max(prev.endMs, fragment.endMs);
      continue;
    }
    if (prev) prev.text = normalizeTurnText(prev.text);
    turns.push({ ...fragment });
  }
  const last = turns[turns.length - 1];
  if (last) last.text = normalizeTurnText(last.text);
  return turns;
}

export function latestTurnText(
  turns: TranscriptTurn[],
  speaker: TranscriptTurn["speaker"],
): string {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.speaker === speaker) return turn.text;
  }
  return "";
}

function normalizeTurnText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
