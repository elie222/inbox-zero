import { describe, expect, it } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import { parsedMessageBodyObservation } from "@/utils/mail-api/observations";
import { parseMessage } from "./message";
import type { MessageWithPayload } from "@/utils/types";

const shelf = "Hello, I would like to order the same shelf again.";
const signature = "Sent from my iPhone";

/**
 * What the reader shows. HTML wins, and a stored HTML body drops its text
 * part, so a signature-only HTML part hides the plain message.
 */
function shownBody(message: MessageWithPayload) {
  const parsed = parseMessage(message);
  const observation = parsedMessageBodyObservation("account", parsed);
  return observation?.html ?? observation?.text ?? "";
}

describe("Apple Mail message bodies", () => {
  it("keeps text split around an inline image, including the signature", () => {
    const shown = shownBody(appleMailSplitAroundImage());
    expect(shown).toContain(shelf);
    expect(shown).toContain(signature);
  });

  it("joins plain parts split around an inline image", () => {
    const shown = shownBody(
      message(
        "multipart/mixed",
        [
          textPart("text/plain", `${shelf}\n\n`),
          {
            mimeType: "image/jpeg",
            filename: "image0.jpeg",
            headers: [
              {
                name: "Content-Disposition",
                value: "inline; filename=image0.jpeg",
              },
            ],
            body: { attachmentId: "inline-image", size: 32 },
          },
          textPart("text/plain", `${signature}\n`),
        ],
        { boundary: "Apple-Mail-PLAIN" },
      ),
    );
    expect(shown).toContain(shelf);
    expect(shown).toContain(signature);
  });

  it("uses the plain part when the HTML alternative is only the signature", () => {
    const shown = shownBody(appleMailSignatureOnlyHtml());
    expect(shown).toContain(shelf);
    expect(shown).toContain(signature);
  });

  it("leaves a normal alternative body unchanged", () => {
    const parsed = parseMessage(
      message("multipart/alternative", [
        textPart("text/plain", "Hello from the shelf team."),
        textPart("text/html", "<p>Hello from the shelf team.</p>"),
      ]),
    );
    expect(parsed.textHtml).toBe("<p>Hello from the shelf team.</p>");
    expect(parsed.textPlain).toBe("Hello from the shelf team.");
  });
});

/**
 * Apple Mail puts each run of text in its own HTML part when a photo sits in
 * the middle. The list snippet is the start of the message; the last part is
 * the signature.
 *
 * multipart/mixed; boundary=Apple-Mail-FIXTURE
 *   multipart/alternative
 *     text/plain
 *     text/html
 *   image/jpeg; disposition=inline
 *   text/html  "Sent from my iPhone"
 */
function appleMailSplitAroundImage(): MessageWithPayload {
  return message(
    "multipart/mixed",
    [
      {
        mimeType: "multipart/alternative",
        parts: [
          textPart("text/plain", `${shelf}\n\n`),
          textPart("text/html", `<div>${shelf}</div>`),
        ],
      },
      {
        mimeType: "image/jpeg",
        filename: "image0.jpeg",
        headers: [
          { name: "Content-Type", value: "image/jpeg; name=image0.jpeg" },
          {
            name: "Content-Disposition",
            value: "inline; filename=image0.jpeg",
          },
          { name: "Content-ID", value: "<image0@apple.example>" },
        ],
        body: { attachmentId: "inline-image", size: 128 },
      },
      textPart("text/html", `<div>${signature}</div>`),
    ],
    { boundary: "Apple-Mail-FIXTURE" },
  );
}

/**
 * multipart/alternative
 *   text/plain  full message
 *   text/html   signature only
 */
function appleMailSignatureOnlyHtml(): MessageWithPayload {
  return message("multipart/alternative", [
    textPart("text/plain", `${shelf}\n\n${signature}\n`),
    textPart("text/html", `<html><body>${signature}</body></html>`),
  ]);
}

function message(
  mimeType: string,
  parts: gmail_v1.Schema$MessagePart[],
  options?: { boundary?: string },
): MessageWithPayload {
  const contentType = options?.boundary
    ? `${mimeType}; boundary=${options.boundary}`
    : mimeType;
  return {
    id: "message",
    threadId: "thread",
    snippet: shelf,
    payload: {
      mimeType,
      headers: [
        { name: "Content-Type", value: contentType },
        { name: "From", value: "Buyer <buyer@example.com>" },
        { name: "To", value: "support@example.com" },
        { name: "Subject", value: "Shelf" },
        { name: "Date", value: "Tue, 6 Oct 2026 12:00:00 +0000" },
      ],
      parts,
    },
  };
}

function textPart(
  mimeType: "text/plain" | "text/html",
  text: string,
): gmail_v1.Schema$MessagePart {
  return {
    mimeType,
    headers: [{ name: "Content-Type", value: `${mimeType}; charset=utf-8` }],
    body: { data: Buffer.from(text).toString("base64url"), size: text.length },
  };
}
