import { describe, expect, it, vi } from "vitest";
import type { EmailThread } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { GmailLabel } from "@/utils/gmail/label";
import { GmailProvider } from "./google";

vi.mock("server-only", () => ({}));

describe("GmailProvider.getLatestMessageInThread", () => {
  it("returns latest non-draft message when newest message is a draft", async () => {
    const provider = new GmailProvider({} as any);

    vi.spyOn(provider, "getThread").mockResolvedValue(
      createThread([
        createParsedMessage({
          id: "non-draft-older",
          internalDate: "1000",
        }),
        createParsedMessage({
          id: "draft-newest",
          internalDate: "3000",
          labelIds: [GmailLabel.DRAFT],
        }),
        createParsedMessage({
          id: "non-draft-newest",
          internalDate: "2000",
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest?.id).toBe("non-draft-newest");
  });

  it("returns null when all thread messages are drafts", async () => {
    const provider = new GmailProvider({} as any);

    vi.spyOn(provider, "getThread").mockResolvedValue(
      createThread([
        createParsedMessage({
          id: "draft-1",
          internalDate: "1000",
          labelIds: [GmailLabel.DRAFT],
        }),
        createParsedMessage({
          id: "draft-2",
          internalDate: "2000",
          labelIds: [GmailLabel.DRAFT],
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest).toBeNull();
  });
});

function createThread(messages: ParsedMessage[]): EmailThread {
  return {
    id: "thread-1",
    messages,
    snippet: "snippet",
  };
}

function createParsedMessage({
  id,
  internalDate,
  labelIds,
}: {
  id: string;
  internalDate: string;
  labelIds?: string[];
}): ParsedMessage {
  return {
    id,
    threadId: "thread-1",
    labelIds,
    snippet: "",
    historyId: "history-1",
    inline: [],
    headers: {
      subject: "Subject",
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Mon, 01 Jan 2026 00:00:00 +0000",
    },
    subject: "Subject",
    date: "Mon, 01 Jan 2026 00:00:00 +0000",
    internalDate,
    textPlain: "",
    textHtml: "",
  };
}
