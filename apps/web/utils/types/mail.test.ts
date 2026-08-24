import { describe, expect, it } from "vitest";
import {
  EMAIL_SEND_LIMITS,
  sendEmailBody,
  toMailerAttachments,
  validateSendEmailPayloadSize,
} from "./mail";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

  it("bounds the HTML and combined serialized payload", () => {
    expect(
      sendEmailBody.safeParse({
        ...message,
        messageHtml: "a".repeat(EMAIL_SEND_LIMITS.maxHtmlCharacters + 1),
      }).success,
    ).toBe(false);
    expect(
      validateSendEmailPayloadSize({
        messageHtml: "a".repeat(
          EMAIL_SEND_LIMITS.maxSerializedPayloadBytes + 1,
        ),
      }).valid,
    ).toBe(false);
  });
});

describe("toMailerAttachments", () => {
  it("marks composer payloads as base64 and preserves inline MIME metadata", () => {
    expect(
      toMailerAttachments([
        {
          content: "aGVsbG8=",
          contentId: "image@example",
          contentType: "image/png",
          disposition: "inline",
          filename: "image.png",
        },
      ]),
    ).toEqual([
      {
        cid: "image@example",
        content: "aGVsbG8=",
        contentDisposition: "inline",
        contentType: "image/png",
        encoding: "base64",
        filename: "image.png",
      },
    ]);
  });
});
