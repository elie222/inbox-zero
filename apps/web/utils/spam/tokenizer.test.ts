import { describe, expect, it } from "vitest";
import { SpamTokenizer } from "./tokenizer";

describe("contextual mail features", () => {
  it("keeps body casing separate from headers and splits email identity", () => {
    const tokenizer = new SpamTokenizer();
    tokenizer.words("Invoice Example@domain.test");
    tokenizer.words("Invoice", "subject");
    expect(tokenizer.tokens.get("invoice")).toBe(1);
    expect(tokenizer.tokens.get("S:Invoice")).toBe(1);
    expect(tokenizer.tokens.get("example@")).toBe(1);
    expect(tokenizer.tokens.get("@domain.test")).toBe(1);
  });
  it("retains hidden and anchor features while skipping scripts", () => {
    const tokenizer = new SpamTokenizer();
    tokenizer.html(
      'zephyr<script>discarded</script>nebula<a>cobalt</a><span style="display:none">quartz</span>',
    );
    expect(tokenizer.tokens.get("zephyrnebula")).toBe(1);
    expect(tokenizer.tokens.get("discarded")).toBeUndefined();
    expect(tokenizer.tokens.get("A:cobalt")).toBe(1);
    expect(tokenizer.tokens.get("V:quartz")).toBe(1);
  });
  it("uses inserted punctuation correction once and separates URL context", () => {
    const tokenizer = new SpamTokenizer();
    tokenizer.words("med;icine https://example.test/path");
    expect(tokenizer.tokens.get("medicine")).toBe(1);
    expect(tokenizer.tokens.get("U:example")).toBe(1);
    expect(tokenizer.tokens.get("U:path")).toBe(1);
  });
});
