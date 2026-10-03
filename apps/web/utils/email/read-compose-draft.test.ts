import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import {
  readComposeDraft,
  readComposeDraftForMessage,
} from "./read-compose-draft";

const provider = {
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
} as unknown as EmailProvider;

describe("complete compose draft reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(provider.getDraft).mockResolvedValue(draftMessage());
    vi.mocked(provider.getDraftReferenceForMessage).mockResolvedValue({
      id: "provider-draft",
    });
  });

  it("returns the complete body, sender, every recipient, and attachment identities", async () => {
    const result = await readComposeDraft({
      provider,
      draftId: "provider-draft",
    });
    expect(result).toEqual({
      draftId: "provider-draft",
      messageId: "message",
      threadId: "thread",
      from: "Sender <sender@example.com>",
      to: '"Last, First" <to@example.com>',
      cc: "copy@example.com",
      bcc: "hidden@example.com",
      subject: "Subject",
      html: "<p><strong>Full rich body</strong></p>".repeat(100),
      text: "Full plain body".repeat(100),
      attachments: [
        {
          attachmentId: "file",
          filename: "report.pdf",
          mimeType: "application/pdf",
          size: 123,
          inline: false,
          contentId: null,
        },
        {
          attachmentId: "logo",
          filename: "logo.png",
          mimeType: "image/png",
          size: 45,
          inline: true,
          contentId: "logo@draft",
        },
      ],
    });
  });

  it("looks up the real provider draft id instead of treating its message id as a draft id", async () => {
    const result = await readComposeDraftForMessage({
      provider,
      messageId: "message",
    });
    expect(result?.draftId).toBe("provider-draft");
    expect(provider.getDraft).toHaveBeenCalledWith("provider-draft");
  });

  it("represents a text-only draft without synthesizing HTML from its snippet", async () => {
    vi.mocked(provider.getDraft).mockResolvedValue({
      ...draftMessage(),
      textHtml: undefined,
      inline: [],
      attachments: undefined,
    });
    const result = await readComposeDraft({
      provider,
      draftId: "provider-draft",
    });
    expect(result?.html).toBeNull();
    expect(result?.text).toBe("Full plain body".repeat(100));
    expect(result?.attachments).toEqual([]);
  });

  it("never invents a missing inline content id from a filename", async () => {
    const message = draftMessage();
    message.inline[0].headers["content-id"] = "";
    vi.mocked(provider.getDraft).mockResolvedValue(message);
    const result = await readComposeDraft({
      provider,
      draftId: "provider-draft",
    });
    expect(result?.attachments[1].contentId).toBeNull();
  });

  it("returns no draft when the message no longer names a draft", async () => {
    vi.mocked(provider.getDraftReferenceForMessage).mockResolvedValue(null);
    expect(
      await readComposeDraftForMessage({ provider, messageId: "message" }),
    ).toBeNull();
    expect(provider.getDraft).not.toHaveBeenCalled();
  });

  it("returns no draft when it was sent or removed during lookup", async () => {
    vi.mocked(provider.getDraft).mockResolvedValue(null);
    expect(
      await readComposeDraftForMessage({ provider, messageId: "message" }),
    ).toBeNull();
  });

  it("propagates provider failures so clients do not mistake unavailable content for an empty draft", async () => {
    vi.mocked(provider.getDraft).mockRejectedValue(
      new Error("Provider unavailable"),
    );
    await expect(
      readComposeDraft({ provider, draftId: "provider-draft" }),
    ).rejects.toThrow("Provider unavailable");
  });
});

function draftMessage(): ParsedMessage {
  const headers = {
    "content-description": "",
    "content-id": "",
    "content-transfer-encoding": "",
    "content-type": "",
  };
  return {
    id: "message",
    threadId: "thread",
    subject: "Subject",
    date: "2026-01-01",
    historyId: "",
    snippet: "Truncated preview",
    headers: {
      from: "Sender <sender@example.com>",
      to: '"Last, First" <to@example.com>',
      cc: "copy@example.com",
      bcc: "hidden@example.com",
      subject: "Subject",
      date: "2026-01-01",
    },
    textHtml: "<p><strong>Full rich body</strong></p>".repeat(100),
    textPlain: "Full plain body".repeat(100),
    attachments: [
      {
        attachmentId: "file",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 123,
        headers,
      },
    ],
    inline: [
      {
        attachmentId: "logo",
        filename: "logo.png",
        mimeType: "image/png",
        size: 45,
        headers: { ...headers, "content-id": "<logo@draft>" },
      },
    ],
  };
}
