import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assistant chat prompt contract", () => {
  it("preserves learned-pattern guidance for category rule edits", () => {
    const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");

    expect(source).toContain(
      "Prefer learned patterns over static sender lists when updating an existing categorization rule for recurring senders.",
    );
    expect(source).toContain(
      'Do not create semantic duplicates like "Notification" and "Notifications".',
    );
    expect(source).toContain(
      "Pipe-separated sender lists are a last resort for a small explicit set.",
    );
    expect(source).toContain(
      "Do not solve rule overlap by appending long sender exclusion lists to AI instructions.",
    );
  });

  it("preserves exclude guidance for recurring senders that should stop matching", () => {
    const source = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");

    expect(source).toContain("fix it to be an exclude instead");
    expect(source).toContain(
      "prefer updateLearnedPatterns over editing static from/to fields.",
    );
  });
});
