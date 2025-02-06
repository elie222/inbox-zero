import { describe, expect, it } from "vitest";
import { createReplyContent } from "@/utils/gmail/reply";
import type { ParsedMessage } from "@/utils/types";

describe("email formatting", () => {
  it("formats reply email correctly", () => {
    const plainContent = "This is my reply";
    const message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml"> = {
      headers: {
        date: "Sun, Feb 1, 2025, 11:20 PM",
        from: "test@example.com",
        subject: "Test subject",
        to: "recipient@example.com",
        "message-id": "<123@example.com>",
      },
      textPlain: "Original message",
      textHtml: "<div>Original message</div>",
    };

    const { html } = createReplyContent({
      plainContent,
      message,
    });

    expect(html).toBe(
      `
    <div dir="ltr">This is my reply</div>
    <br>
    <div class="gmail_quote">
      <div dir="ltr" class="gmail_attr">On Sat, Feb 1, 2025, 11:20 PM, test@example.com wrote:</div>
      <blockquote class="gmail_quote" 
        style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
        <div>Original message</div>
      </blockquote>
    </div>
  `.trim(),
    );
  });
});
