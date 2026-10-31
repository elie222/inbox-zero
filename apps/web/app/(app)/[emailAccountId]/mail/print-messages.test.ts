import { describe, expect, it } from "vitest";
import { buildPrintDocument } from "@/app/(app)/[emailAccountId]/mail/print-messages";

describe("buildPrintDocument", () => {
  it("escapes header values and plain text bodies", () => {
    const document = buildPrintDocument({
      subject: "<img src=x onerror=alert(1)>",
      messages: [
        {
          id: "message-1",
          headers: {
            from: "Sender <sender@example.com>",
            to: "user@example.com",
            subject: "",
            date: "2026-01-01T10:00:00Z",
          },
          textPlain: "<b>not bold</b>",
          html: null,
        },
      ],
    });

    expect(document).not.toContain("<img src=x");
    expect(document).toContain("Sender &lt;sender@example.com&gt;");
    expect(document).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  it("prints every message with its attachments", () => {
    const document = buildPrintDocument({
      subject: "Trip",
      messages: [
        {
          id: "message-1",
          headers: { from: "a@example.com", to: "", subject: "", date: "" },
          html: "<p>First</p>",
          attachments: [
            {
              attachmentId: "att-1",
              filename: "ticket.pdf",
              headers: {} as never,
              mimeType: "application/pdf",
              size: 1,
            },
          ],
        },
        {
          id: "message-2",
          headers: { from: "b@example.com", to: "", subject: "", date: "" },
          html: "<p>Second</p>",
        },
      ],
    });

    expect(document).toContain("<p>First</p>");
    expect(document).toContain("<p>Second</p>");
    expect(document).toContain("Attachments: ticket.pdf");
    expect(document).not.toContain("To:");
  });
});
