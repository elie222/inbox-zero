import { describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { formatEmailDate } from "@/utils/gmail/reply";

import {
  buildReplyMessageText,
  convertTextToHtmlParagraphs,
} from "@/utils/gmail/mail";

describe("convertTextToHtmlParagraphs", () => {
  it("preserves paragraph spacing with double newlines", () => {
    const input = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const result = convertTextToHtmlParagraphs(input);

    // The output should have visual spacing between paragraphs using <br> tags
    expect(result).toContain("<p>First paragraph.</p>");
    expect(result).toContain("<p>Second paragraph.</p>");
    expect(result).toContain("<p>Third paragraph.</p>");

    // Should have <br> tags for spacing between paragraphs
    expect(result).toContain("<br>");

    // Verify the exact structure: paragraph, br (for empty line), paragraph
    expect(result).toBe(
      "<html><body><p>First paragraph.</p><br><p>Second paragraph.</p><br><p>Third paragraph.</p></body></html>",
    );
  });

  it("handles CRLF line endings", () => {
    const input = "First line\r\nSecond line\r\nThird line";
    const result = convertTextToHtmlParagraphs(input);

    // Should NOT have \r characters in output
    expect(result).not.toContain("\r");

    // Should properly separate into paragraphs
    expect(result).toContain("<p>First line</p>");
    expect(result).toContain("<p>Second line</p>");
    expect(result).toContain("<p>Third line</p>");
  });

  it("handles empty input", () => {
    expect(convertTextToHtmlParagraphs("")).toBe("");
    expect(convertTextToHtmlParagraphs(null)).toBe("");
    expect(convertTextToHtmlParagraphs(undefined)).toBe("");
  });

  it("handles single line input", () => {
    const input = "Just one line";
    const result = convertTextToHtmlParagraphs(input);
    expect(result).toBe("<html><body><p>Just one line</p></body></html>");
  });

  it("builds a plain-text alternative from rendered reply html", () => {
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

    const plainText = buildReplyMessageText({
      textContent:
        'Use <a href="https://example.com/login">the login page</a>\n\n<p>Best regards,<br>John</p>',
      message,
    });

    expect(plainText).toContain(
      "Use the login page [https://example.com/login]",
    );
    expect(plainText).toContain("Best regards,\nJohn");
    const quotedHeader = `\n\nOn ${formatEmailDate(new Date(message.headers.date))}, John Doe <john@example.com> wrote:\n\n`;
    expect(plainText).toContain(quotedHeader);
    expect(plainText).toContain("John Doe <john@example.com> wrote:");
    expect(plainText).toContain("> Original message content");
    expect(plainText).not.toContain("<a href=");
  });
});
