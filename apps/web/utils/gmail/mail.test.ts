import type { gmail_v1 } from "@googleapis/gmail";
import { describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { parseMessage } from "@/utils/gmail/message";
import { formatEmailDate } from "@/utils/email/reply-quote";

import {
  buildReplyMessageText,
  createMail,
  forwardEmail,
  convertTextToHtmlParagraphs,
  stripHtmlTagsForPlainText,
} from "@/utils/gmail/mail";

describe("createMail", () => {
  describe.each([
    ["from", "From"],
    ["to", "To"],
    ["cc", "Cc"],
    ["bcc", "Bcc"],
    ["replyTo", "Reply-To"],
  ] as const)("angle-bracket %s addresses", (field, header) => {
    it.each([
      "recipient@example.com(comment)",
      "recipient(comment)@example.com",
      "recipient@(comment)example.com",
      "recipient@example.com(comment)evil.example",
      '"recipient"@example.com(comment)evil.example',
    ])("strips comments from %s", async (address) => {
      const options: Parameters<typeof createMail>[0] = {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Comment parsing",
        text: "Message",
      };
      options[field] = `Recipient <${address}>`;

      const raw = await createMail(options);
      const message = Buffer.from(raw, "base64url").toString("utf8");

      const headerLine = message
        .split("\r\n")
        .find((line) => line.startsWith(`${header}: `));

      expect(headerLine).toMatch(/<(?:recipient|"recipient")@example\.com>$/);
    });
  });

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

it.each([
  {
    disposition: "INLINE; filename=unrelated-name.png",
    cid: " <diagram@example> ",
    expectedDisposition: "inline",
    source: "inline",
  },
  {
    disposition: undefined,
    cid: "<diagram@example>",
    expectedDisposition: "inline",
    source: "inline",
  },
  {
    disposition: undefined,
    cid: "",
    expectedDisposition: "attachment",
    source: "attachments",
  },
  {
    disposition: "attachment; filename=unrelated-name.png",
    cid: "<diagram@example>",
    expectedDisposition: "attachment",
    source: "attachments",
  },
])("forwards parsed Gmail $source parts with $expectedDisposition MIME semantics ($disposition)", async ({
  disposition,
  cid,
  expectedDisposition,
  source,
}) => {
  const part = {
    partId: "1.2",
    filename: "unrelated-name.png",
    mimeType: "image/png",
    headers: [
      ...(cid ? [{ name: "Content-ID", value: cid }] : []),
      ...(disposition
        ? [{ name: "Content-Disposition", value: disposition }]
        : []),
    ],
    body:
      !cid && !disposition
        ? { attachmentId: "provider-file", size: 14 }
        : {
            data: Buffer.from("embedded-image").toString("base64url"),
            size: 14,
          },
  };
  const payload = {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "sender@example.com" },
      { name: "To", value: "recipient@example.com" },
      { name: "Subject", value: "Image" },
      { name: "Date", value: "2026-01-01" },
      { name: "Message-ID", value: "<original@example>" },
    ],
    parts: [
      {
        partId: "1.1",
        mimeType: "text/html",
        body: {
          data: Buffer.from(
            cid
              ? '<p>Image <img src="cid:diagram@example"></p>'
              : "<p>Attached image</p>",
          ).toString("base64url"),
        },
      },
      part,
    ],
  };
  const message = parseMessage({
    id: "original",
    threadId: "original-thread",
    payload,
  });
  expect(
    source === "inline" ? message.inline : message.attachments,
  ).toHaveLength(1);
  const get = vi.fn().mockResolvedValue({ data: { payload } });
  const attachmentGet = vi.fn().mockResolvedValue({
    data: { data: Buffer.from("embedded-image").toString("base64url") },
  });
  const send = vi.fn().mockResolvedValue({ data: { id: "forwarded" } });
  const gmail = {
    users: { messages: { get, send, attachments: { get: attachmentGet } } },
  } as unknown as gmail_v1.Gmail;
  await forwardEmail(gmail, message, { to: "recipient@example.com" });
  const raw = Buffer.from(
    send.mock.calls[0][0].requestBody.raw,
    "base64url",
  ).toString("utf8");
  expect(raw).toContain(`Content-Disposition: ${expectedDisposition}`);
  expect(raw).toContain(Buffer.from("embedded-image").toString("base64"));
  expect(raw).not.toContain("Content-ID: <unrelated-name.png>");
  if (cid) {
    expect(raw).toContain("Content-ID: <diagram@example>");
    expect(raw).toContain('src=3D"cid:diagram@example"');
  } else {
    expect(raw).not.toContain("Content-ID:");
    expect(raw).not.toContain("cid:");
  }
  if (part.body.attachmentId) {
    expect(attachmentGet).toHaveBeenCalledWith({
      userId: "me",
      id: "provider-file",
      messageId: message.id,
    });
  } else {
    expect(get).toHaveBeenCalledWith(
      { userId: "me", id: message.id, format: "full" },
      { signal: undefined },
    );
  }
});

vi.mock("@/utils/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/mail")>()),
  ensureEmailSendingEnabled: vi.fn(),
}));

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
