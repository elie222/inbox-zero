import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, decodeSnippet } from "./decode";

describe("decodeHtmlEntities", () => {
  it("preserves zero-width characters in full email content", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}";
    const text = `Hello &#39;${family}\u200C\uFEFF`;

    expect(decodeHtmlEntities(text)).toBe(`Hello '${family}\u200C\uFEFF`);
  });
});

describe("decodeSnippet", () => {
  it("strips zero-width characters from snippets after decoding entities", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}";
    const text = `Hello &#39;${family}\u200C\uFEFF`;

    expect(decodeSnippet(text)).toBe(`Hello '${family.replace(/\u200D/g, "")}`);
  });
});
