export type ParsedLiveEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "session.closed" }
  | {
      type: "input_transcript";
      delta: string;
      startMs: number;
      endMs: number;
    }
  | {
      type: "output_transcript";
      delta: string;
      startMs: number;
      endMs: number;
    }
  | { type: "ignored" };

export function parseLiveEvent(raw: unknown): ParsedLiveEvent {
  if (!raw || typeof raw !== "object") return { type: "ignored" };
  const event = raw as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";

  if (type === "session.started") {
    const session = event.session as { id?: unknown } | undefined;
    const sessionId = String(session?.id ?? event.session_id ?? "").trim();
    return sessionId
      ? { type: "session.started", sessionId }
      : { type: "ignored" };
  }

  if (type === "session.closed") {
    return { type: "session.closed" };
  }

  if (
    type === "session.input_transcript.delta" ||
    type === "session.output_transcript.delta"
  ) {
    const delta = String(event.delta ?? "").trim();
    if (!delta) return { type: "ignored" };
    return {
      type:
        type === "session.input_transcript.delta"
          ? "input_transcript"
          : "output_transcript",
      delta,
      startMs: numberField(event.start_ms),
      endMs: numberField(event.end_ms),
    };
  }

  return { type: "ignored" };
}

function numberField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
