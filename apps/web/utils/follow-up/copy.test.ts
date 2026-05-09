import { describe, expect, it } from "vitest";
import { normalizeFollowUpText, truncateSnippet } from "./copy";

describe("follow-up notification copy", () => {
  it("keeps metadata normalized to a single line", () => {
    expect(normalizeFollowUpText("  Status&nbsp;update\n\nfrom\tAlex  ")).toBe(
      "Status update from Alex",
    );
  });

  it("preserves readable snippet paragraphs beyond the short metadata preview length", () => {
    const body =
      "I hope you're doing well. I'm reaching out because I'd like to find some time for us to reunite and discuss the new ebook. ";
    const snippet = [
      "Hi Barbara,",
      "",
      body.repeat(3).trim(),
      "Please let me know when you might be available to chat.",
      "",
      "Best regards,",
    ].join("\n");

    expect(snippet.length).toBeGreaterThan(280);
    expect(truncateSnippet(snippet)).toBe(snippet);
  });
});
