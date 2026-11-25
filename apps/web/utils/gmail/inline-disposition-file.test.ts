import { describe, expect, it } from "vitest";
import { parseMessage } from "./message";
import type { MessageWithPayload } from "@/utils/types";

// Apple Mail sends a file dropped into the body as an inline part without a
// Content-ID, nested between two HTML parts. Gmail lists it as an attachment.
describe("parseMessage with inline-disposition files", () => {
  it("lists an inline PDF without Content-ID as an attachment", () => {
    const parsed = parseMessage(appleMailMessage());

    expect(parsed.attachments).toEqual([
      expect.objectContaining({
        attachmentId: "pdf-attachment-id",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
      }),
    ]);
    expect(parsed.inline).toEqual([]);
    expect(parsed.hasAttachment).toBe(true);
  });

  it("still treats cid-referenced images as inline", () => {
    const message = appleMailMessage();
    const mixed = message.payload.parts![1];
    mixed.parts!.push({
      partId: "1.3",
      mimeType: "image/png",
      filename: "logo.png",
      headers: [
        { name: "Content-Type", value: 'image/png; name="logo.png"' },
        { name: "Content-Disposition", value: 'inline; filename="logo.png"' },
        { name: "Content-ID", value: "<logo@example.test>" },
      ],
      body: { attachmentId: "logo-attachment-id", size: 100_000 },
    });

    const parsed = parseMessage(message);

    expect(parsed.attachments?.map((a) => a.filename)).toEqual(["invoice.pdf"]);
    expect(parsed.inline.map((a) => a.filename)).toEqual(["logo.png"]);
  });
});

function appleMailMessage(): MessageWithPayload {
  const html = (text: string) => Buffer.from(text).toString("base64url");
  return {
    id: "message",
    threadId: "thread",
    payload: {
      partId: "",
      mimeType: "multipart/alternative",
      headers: [{ name: "Subject", value: "Invoice" }],
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          body: { data: html("Invoice attached."), size: 17 },
        },
        {
          partId: "1",
          mimeType: "multipart/mixed",
          parts: [
            {
              partId: "1.0",
              mimeType: "text/html",
              body: { data: html("<p>Invoice attached.</p>"), size: 24 },
            },
            {
              partId: "1.1",
              mimeType: "application/pdf",
              filename: "invoice.pdf",
              headers: [
                {
                  name: "Content-Disposition",
                  value: 'inline; filename="invoice.pdf"',
                },
                {
                  name: "Content-Type",
                  value:
                    'application/pdf; x-unix-mode=0666; name="invoice.pdf"',
                },
              ],
              body: { attachmentId: "pdf-attachment-id", size: 77_413 },
            },
            {
              partId: "1.2",
              mimeType: "text/html",
              body: { data: html("<p>Signature</p>"), size: 16 },
            },
          ],
        },
      ],
    },
  };
}
