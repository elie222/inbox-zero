import { describe, expect, it } from "vitest";
import { hasVariables } from "./template";

describe("hasVariables", () => {
  it.each<[string | null | undefined, boolean]>([
    ["Hello {{ name }}", true],
    ["Hello {{\nname\n}}", true],
    ["{{}}", true],
    ["Hello {name}", false],
    ["Hello {{name", false],
    ["Hello name}}", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("detects template delimiters in %j", (text, expected) => {
    expect(hasVariables(text)).toBe(expected);
  });
});
