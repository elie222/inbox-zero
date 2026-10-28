import { describe, expect, it } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { toLocalMailMessage } from "./local-mail-sync";

describe("local mail content projection", () => {
  it("retains body text and attachment metadata without retaining parser binary payloads", () => {
    const attachment = {
      attachmentId: "attachment-1",
      filename: "document.pdf",
      mimeType: "application/pdf",
      size: 1000,
      headers: {
        "content-description": "Document",
        "content-id": "part-1",
        "content-transfer-encoding": "base64",
        "content-type": "application/pdf",
        data: "encoded-file",
      },
      data: "encoded-file",
      body: { data: "encoded-file" },
    };
    const message = {
      ...getMockMessage({ attachments: [attachment] }),
      inline: [attachment],
      raw: "raw-message",
      payload: { body: { data: "encoded-file" } },
    };
    const projected = toLocalMailMessage(message);
    expect(projected.textPlain).toBe(message.textPlain);
    expect(projected.textHtml).toBe(message.textHtml);
    expect(projected.attachments?.[0]).toMatchObject({
      attachmentId: "attachment-1",
      filename: "document.pdf",
      size: 1000,
    });
    expect(projected.inline[0]?.headers["content-id"]).toBe("part-1");
    expect(JSON.stringify(projected)).not.toContain("encoded-file");
    expect(projected).not.toHaveProperty("raw");
    expect(projected).not.toHaveProperty("payload");
  });

  it("indexes HTML-only mail without fetching images or dropping quoted content", () => {
    const message = {
      ...getMockMessage(),
      textPlain: undefined,
      textHtml:
        '<p>Hello 世界</p><blockquote>Earlier content</blockquote><img src="https://example.com/pixel">',
    };
    const projected = toLocalMailMessage(message);
    expect(projected.textPlain).toContain("Hello 世界");
    expect(projected.textPlain).toContain("Earlier content");
    expect(projected.textPlain).not.toContain("pixel");
    expect(projected.textHtml).toBe(message.textHtml);
  });

  it("does not mark an absent body representation as fetched empty text", () => {
    const projected = toLocalMailMessage({
      ...getMockMessage(),
      textPlain: undefined,
      textHtml: undefined,
    });
    expect(projected.textPlain).toBeUndefined();
  });

  it("preserves a successfully fetched empty body", () => {
    expect(
      toLocalMailMessage({ ...getMockMessage(), textPlain: "" }).textPlain,
    ).toBe("");
  });
});
