import { describe, expect, it } from "vitest";
import {
  isValidSnippetShortcut,
  normalizeSnippetShortcut,
} from "./snippet-shortcut";

describe("normalizeSnippetShortcut", () => {
  it("strips a leading slash, casing, and surrounding space", () => {
    expect(normalizeSnippetShortcut(" /Follow-Up ")).toBe("follow-up");
  });

  it("strips repeated leading slashes", () => {
    expect(normalizeSnippetShortcut("//thanks")).toBe("thanks");
  });
});

describe("isValidSnippetShortcut", () => {
  it("accepts a letter followed by letters, numbers, or hyphens", () => {
    expect(isValidSnippetShortcut("thanks")).toBe(true);
    expect(isValidSnippetShortcut("q1-update")).toBe(true);
  });

  it("rejects shortcuts that do not start with a letter", () => {
    expect(isValidSnippetShortcut("1intro")).toBe(false);
    expect(isValidSnippetShortcut("-intro")).toBe(false);
    expect(isValidSnippetShortcut("")).toBe(false);
  });

  it("rejects spaces and punctuation", () => {
    expect(isValidSnippetShortcut("follow up")).toBe(false);
    expect(isValidSnippetShortcut("follow_up")).toBe(false);
  });
});
