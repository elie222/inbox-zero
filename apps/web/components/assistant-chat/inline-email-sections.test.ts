import { describe, expect, it } from "vitest";
import { stripInlineEmailSections } from "@/components/assistant-chat/inline-email-sections";

describe("stripInlineEmailSections", () => {
  it("removes inline email blocks when cards are hidden", () => {
    const text = `I found the message you asked about.
<emails>
<email threadid="thread-1">Review this</email>
</emails>
The draft is ready for review.`;

    expect(stripInlineEmailSections(text)).toBe(
      "I found the message you asked about.\n\nThe draft is ready for review.",
    );
  });
});
