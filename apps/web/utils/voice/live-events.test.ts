import { describe, expect, it } from "vitest";
import { parseLiveEvent } from "./live-events";

describe("parseLiveEvent", () => {
  it("reads a session start", () => {
    expect(
      parseLiveEvent({
        type: "session.started",
        session: { id: "live_123" },
      }),
    ).toEqual({ type: "session.started", sessionId: "live_123" });
  });

  it("reads transcript deltas with timestamps", () => {
    expect(
      parseLiveEvent({
        type: "session.input_transcript.delta",
        delta: "hello there",
        start_ms: 120,
        end_ms: 800,
      }),
    ).toEqual({
      type: "input_transcript",
      delta: "hello there",
      startMs: 120,
      endMs: 800,
    });
  });

  it("ignores unknown or empty events", () => {
    expect(parseLiveEvent({ type: "session.updated" })).toEqual({
      type: "ignored",
    });
    expect(
      parseLiveEvent({ type: "session.output_transcript.delta", delta: "" }),
    ).toEqual({ type: "ignored" });
  });
});
