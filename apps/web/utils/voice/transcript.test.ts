import { describe, expect, it } from "vitest";
import {
  appendTranscriptDelta,
  groupTranscriptTurns,
  latestTurnText,
} from "./transcript";

describe("transcript grouping", () => {
  it("joins nearby fragments from the same speaker", () => {
    const fragments = appendTranscriptDelta(
      appendTranscriptDelta([], "user", "draft a reply", 0, 400),
      "user",
      " keep it brief",
      500,
      900,
    );
    const turns = groupTranscriptTurns(fragments);
    expect(turns).toEqual([
      {
        speaker: "user",
        text: "draft a reply keep it brief",
        startMs: 0,
        endMs: 900,
      },
    ]);
  });

  it("keeps fragment boundaries instead of inserting spaces", () => {
    const fragments = appendTranscriptDelta(
      appendTranscriptDelta([], "user", "hel", 0, 200),
      "user",
      "lo",
      210,
      400,
    );
    expect(groupTranscriptTurns(fragments).map((turn) => turn.text)).toEqual([
      "hello",
    ]);
  });

  it("starts a new turn after a pause or speaker change", () => {
    const fragments = [
      ...appendTranscriptDelta([], "user", "can you draft this", 0, 400),
    ];
    const withAssistant = appendTranscriptDelta(
      fragments,
      "assistant",
      "Sure.",
      700,
      900,
    );
    const withLaterUser = appendTranscriptDelta(
      withAssistant,
      "user",
      "keep it short",
      2200,
      2600,
    );
    expect(
      groupTranscriptTurns(withLaterUser).map((turn) => turn.text),
    ).toEqual(["can you draft this", "Sure.", "keep it short"]);
  });

  it("returns the latest user turn", () => {
    const turns = groupTranscriptTurns(
      appendTranscriptDelta(
        appendTranscriptDelta([], "user", "first", 0, 200),
        "assistant",
        "ok",
        300,
        400,
      ),
    );
    expect(latestTurnText(turns, "user")).toBe("first");
    expect(latestTurnText(turns, "assistant")).toBe("ok");
  });

  it("ignores empty deltas", () => {
    expect(appendTranscriptDelta([], "user", "", 0, 10)).toEqual([]);
  });
});
