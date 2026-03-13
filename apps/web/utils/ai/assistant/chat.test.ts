import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assistant chat prompt contract", () => {
  it("reuses the shared rule best-practices guidance", () => {
    const chatSource = readFileSync(
      new URL("./chat.ts", import.meta.url),
      "utf8",
    );
    const guidanceSource = readFileSync(
      new URL("../rule/prompt-to-rules-guidance.ts", import.meta.url),
      "utf8",
    );

    expect(chatSource).toContain("PROMPT_TO_RULES_BEST_PRACTICES");
    expect(guidanceSource).toContain(
      "Prefer learned patterns over static sender lists when updating an existing categorization rule for recurring senders.",
    );
    expect(guidanceSource).toContain(
      "Do not solve rule overlap by appending long sender exclusion lists to AI instructions.",
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
