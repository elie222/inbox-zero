import { describe, expect, it } from "vitest";
import { createReplyContent } from "@/utils/gmail/reply";
import type { ParsedMessage } from "@/utils/types";

describe("email formatting", () => {
  it("formats reply email like Gmail", () => {
    const textContent = "This is my reply";
    const message: Pick<ParsedMessage, "headers" | "textPlain" | "textHtml"> = {
      headers: {
        date: "Thu, 6 Feb 2025 23:23:47 +0200",
        from: "John Doe <john@example.com>",
        subject: "Test Email",
        to: "jane@example.com",
        "message-id": "<123@example.com>",
      },
      textPlain: "Original message content",
      textHtml: "<div>Original message content</div>",
    };

    const { html } = createReplyContent({
      textContent,
      htmlContent: "",
      message,
    });

    expect(html).toBe(
      `<div dir="ltr">This is my reply</div>
<br>
<div class="gmail_quote gmail_quote_container">
  <div dir="ltr" class="gmail_attr">On Thu, 6 Feb 2025 at 23:23, John Doe <john@example.com> wrote:<br></div>
  <blockquote class="gmail_quote" 
    style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
    <div>Original message content</div>
  </blockquote>
</div>`.trim(),
    );
  });
});
