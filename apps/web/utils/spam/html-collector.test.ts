import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/html-tokens.json";
import { SpamTokenizer } from "./tokenizer";

describe("HTML collector reference outputs", () => {
  for (const fixture of fixtures)
    it(fixture.id, () => {
      const tokenizer = new SpamTokenizer();
      tokenizer.html(fixture.html);
      if (fixture.id === "full-html-research-oracle-output.json:h005") {
        expect(tokenizer.warnings.has("portable-language-segmentation")).toBe(
          true,
        );
        expect(tokenizer.tokens.get("日本語")).toBe(1);
        expect(tokenizer.tokens.get("本文")).toBe(1);
      } else
        expect(Object.fromEntries(tokenizer.tokens)).toEqual(fixture.expected);
    });
});
