import { setupI18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { formatMessagesAsText } from "@/app/(app)/[emailAccountId]/mail/copy-messages";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

describe("formatMessagesAsText", () => {
  it("includes the sender, recipients and body of each message", () => {
    const text = formatMessagesAsText({
      i18n,
      subject: "Dictation broken",
      messages: [
        {
          headers: {
            from: "Andreas <andreas@example.com>",
            to: "Support <support@example.com>",
            cc: "team@example.com",
            subject: "Dictation broken",
            date: "2026-11-23T00:10:00Z",
          },
          textPlain: "It stopped working.",
          attachments: [
            {
              filename: "log.txt",
              mimeType: "text/plain",
              size: 1,
              attachmentId: "a",
              headers: {} as never,
            },
          ],
        },
        {
          headers: {
            from: "Support <support@example.com>",
            to: "Andreas <andreas@example.com>",
            subject: "Re: Dictation broken",
            date: "",
          },
          textPlain: "",
          textHtml:
            '<p>We\'ll <a href="https://example.com/fix">fix it</a>.</p>',
        },
      ],
    });

    expect(text).toContain("Subject: Dictation broken");
    expect(text).toContain("From: Andreas <andreas@example.com>");
    expect(text).toContain("To: Support <support@example.com>");
    expect(text).toContain("Cc: team@example.com");
    expect(text).toContain("Attachments: log.txt");
    expect(text).toContain("It stopped working.");
    expect(text).toContain("From: Support <support@example.com>");
    expect(text).toContain("We'll fix it [https://example.com/fix].");
    expect(text).not.toContain("Date: \n");
  });

  it("uses the HTML body the reader shows, keeping link URLs", () => {
    const text = formatMessagesAsText({
      i18n,
      subject: "Invite",
      messages: [
        {
          headers: { from: "a@example.com", to: "", subject: "", date: "" },
          textPlain: "Join here",
          textHtml: '<p>Join <a href="https://example.com/join">here</a></p>',
        },
      ],
    });

    expect(text).toContain("Join here [https://example.com/join]");
  });
});
