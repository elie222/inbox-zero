import { describe, expect, it } from "vitest";
import { speakable, toUtterances } from "./speakable";

describe("speakable", () => {
  it("names a code block instead of reading it", () => {
    const out = speakable(
      "Here's the fix:\n\n```ts\nconst x = 1;\n```\n\nThat's it.",
    );
    expect(out).toContain("TypeScript code block");
    expect(out).not.toContain("const x");
    expect(out).toContain("That's it.");
  });

  it("keeps a link's words and drops its URL", () => {
    expect(speakable("See [the README](https://example.com/a) for more")).toBe(
      "See the README for more",
    );
  });

  it("turns a bare URL into a noun", () => {
    expect(speakable("Deployed to https://status.example.com/health now")).toBe(
      "Deployed to a link now",
    );
  });

  it("is empty for text that speaks to nothing", () => {
    expect(speakable("")).toBe("");
    expect(speakable("```\ncode only\n```")).not.toContain("code only");
  });
});

describe("toUtterances", () => {
  it("splits on sentences", () => {
    const out = toUtterances(
      "The tests pass now. I changed two files. Want me to push it?",
    );
    expect(out).toHaveLength(3);
    expect(out[2]).toBe("Want me to push it?");
  });

  it("does not split inside a decimal or an abbreviation", () => {
    const out = toUtterances(
      "It dropped to 11.7 seconds per step, i.e. about half of what it was before.",
    );
    expect(out).toHaveLength(1);
  });

  it("glues a fragment onto its neighbour", () => {
    const out = toUtterances(
      "Yes. The whole suite is green and nothing else changed.",
    );
    expect(out).toHaveLength(1);
  });

  it("does not merge utterances past maxChars", () => {
    const out = toUtterances(`${"A".repeat(317)}. Yes.`, {
      minChars: 12,
      maxChars: 320,
    });
    expect(out.every((utterance) => utterance.length <= 320)).toBe(true);
    expect(out).toEqual([`${"A".repeat(317)}.`, "Yes."]);
  });

  it("hard-splits a token with no whitespace", () => {
    const token = "A".repeat(500);
    const out = toUtterances(token, { maxChars: 320 });
    expect(out.join("")).toBe(token);
    expect(out.every((utterance) => utterance.length <= 320)).toBe(true);
    expect(out.length).toBeGreaterThan(1);
  });
});
