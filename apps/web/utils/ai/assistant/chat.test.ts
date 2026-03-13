import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assistant chat prompt contract", () => {
  it("interpolates the shared rule best-practices guidance into the chat prompt", () => {
    const chatSource = readFileSync(
      new URL("./chat.ts", import.meta.url),
      "utf8",
    );
    const guidanceSource = readFileSync(
      new URL("../rule/prompt-to-rules-guidance.ts", import.meta.url),
      "utf8",
    );

    expect(chatSource).toMatch(/\$\{PROMPT_TO_RULES_SHARED_BEST_PRACTICES\}/);
    expect(guidanceSource).toContain(
      "Use static conditions for exact deterministic matching, but keep them short and specific.",
    );
    expect(guidanceSource).toContain(
      'In most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.',
    );
  });

  it("preserves chat-specific guidance for existing fetched rules and excludes", () => {
    const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");

    expect(source).toContain(
      "update the best matching existing rule from that list instead of creating a new overlapping rule.",
    );
    expect(source).toContain(
      "Pipe-separated sender lists are a last resort for a small explicit set.",
    );
    expect(source).toContain("fix it to be an exclude instead");
    expect(source).toContain(
      "prefer updateLearnedPatterns over editing static from/to fields.",
    );
  });
});
