import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assistant chat prompt contract", () => {
  it("preserves rule-editing guidance for existing category rules", () => {
    const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");

    expect(source).toContain(
      "Use static conditions for exact deterministic matching, but keep them short and specific.",
    );
    expect(source).toContain(
      "Prefer learned patterns over static sender lists when updating an existing categorization rule for recurring senders.",
    );
  });

  it("preserves chat-specific guidance for existing fetched rules and excludes", () => {
    const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");

    expect(source).toContain(
      "update the best matching existing rule from that list instead of creating a new overlapping rule.",
    );
    expect(source).toContain(
      "If multiple fetched rules are similar, ask the user which one to update instead of assuming.",
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
