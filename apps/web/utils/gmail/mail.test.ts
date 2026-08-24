import { describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { formatEmailDate } from "@/utils/gmail/reply";

import {
  buildReplyMessageText,
  createMail,
  convertTextToHtmlParagraphs,
  sendEmailBody,
  stripHtmlTagsForPlainText,
} from "@/utils/gmail/mail";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("createMail", () => {
  it("keeps BCC recipients in raw messages sent through the Gmail API", async () => {
    const raw = await createMail({
      from: "sender@example.com",
      to: "recipient@example.com",
      bcc: "hidden@example.com",
      subject: "Test",
      text: "Message",
    });

    const message = Buffer.from(raw, "base64url").toString("utf8");

    expect(message).toContain("Bcc: hidden@example.com");
  });

  it("encodes inline images with Content-ID MIME semantics", async () => {
    const raw = await createMail({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Inline image",
      html: '<p>Diagram <img src="cid:diagram@example"></p>',
      attachments: [
        {
          filename: "diagram.png",
          content: Buffer.from("image-bytes"),
          contentType: "image/png",
          contentDisposition: "inline",
          cid: "diagram@example",
        },
      ],
    });

    const message = Buffer.from(raw, "base64url").toString("utf8");

    expect(message).toContain("Content-ID: <diagram@example>");
    expect(message).toContain("Content-Disposition: inline");
    expect(message).toContain('src="cid:diagram@example"');
  });
});

describe("sendEmailBody", () => {
  const message = {
    to: "recipient@example.com",
    subject: "Inline image",
    messageHtml: '<p><img src="cid:image@example"></p>',
  };

  it("accepts a bounded inline image with matching content", () => {
    expect(
      sendEmailBody.safeParse({
        ...message,
        attachments: [
          {
            filename: "image.png",
            content: PNG_BASE64,
            contentType: "image/png",
            disposition: "inline",
            contentId: "image@example",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects spoofed inline image content", () => {
    expect(
      sendEmailBody.safeParse({
        ...message,
        attachments: [
          {
            filename: "image.png",
            content: "bm90LWEtcG5n",
            contentType: "image/png",
            disposition: "inline",
            contentId: "image@example",
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("convertTextToHtmlParagraphs", () => {
  it("separates paragraphs on blank lines", () => {
    const input = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    const result = convertTextToHtmlParagraphs(input);

    expect(result).toBe(
      "<html><body><p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p></body></html>",
    );
  });

  it("turns single CRLF line endings into line breaks", () => {
    const input = "First line\r\nSecond line\r\nThird line";
    const result = convertTextToHtmlParagraphs(input);

    expect(result).not.toContain("\r");
    expect(result).toBe(
      "<html><body><p>First line<br />Second line<br />Third line</p></body></html>",
    );
  });

  it("escapes html in the text", () => {
    const result = convertTextToHtmlParagraphs("<script>alert(1)</script>");

    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
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

describe("stripHtmlTagsForPlainText", () => {
  it("skips HTML comments while preserving surrounding text", () => {
    expect(
      stripHtmlTagsForPlainText(
        "<p>Hello</p><!-- hidden metadata --><p>Regards</p>",
      ).trim(),
    ).toBe("Hello\nRegards");
  });

  it("preserves malformed tag-like text without dropping the rest", () => {
    expect(stripHtmlTagsForPlainText("Hello <broken text")).toBe(
      "Hello <broken text",
    );
  });
});
