import { describe, expect, it } from "vitest";
import { VoiceRequestError } from "./errors";
import { transcriptionTextFromBody } from "./http";

describe("transcriptionTextFromBody", () => {
  it("returns a string transcript, including silence", () => {
    expect(transcriptionTextFromBody({ text: "hello there" })).toBe(
      "hello there",
    );
    expect(transcriptionTextFromBody({ text: "   " })).toBe("");
  });

  it("rejects missing or non-string text", () => {
    const invalidBodies = [null, {}, { text: { nested: true } }];
    for (const body of invalidBodies) {
      expect(() => transcriptionTextFromBody(body)).toThrow(VoiceRequestError);
    }

    let thrown: unknown;
    try {
      transcriptionTextFromBody({ text: { nested: true } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ name: "VoiceRequestError", status: 502 });
  });
});
