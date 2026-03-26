import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailThread } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { GmailLabel } from "@/utils/gmail/label";
import * as gmailLabelModule from "@/utils/gmail/label";
import { GmailProvider } from "./google";

vi.mock("server-only", () => ({}));

const { envMock, gmailMailMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    EMAIL_ENCRYPT_SECRET: "test-encrypt-secret",
    EMAIL_ENCRYPT_SALT: "test-encrypt-salt",
  },
  gmailMailMock: {
    draftEmail: vi.fn().mockResolvedValue({ data: { id: "draft-1" } }),
    forwardEmail: vi.fn(),
    replyToEmail: vi.fn(),
    sendEmailWithPlainText: vi.fn(),
    sendEmailWithHtml: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/gmail/mail", () => gmailMailMock);

describe("GmailProvider.getLatestMessageInThread", () => {
  afterEach(() => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
  });

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

  it("no-ops draftEmail when auto-drafting is disabled", async () => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = true;
    const provider = new GmailProvider({} as any);

    const result = await provider.draftEmail(
      createParsedMessage({
        id: "message-1",
        internalDate: "1000",
      }),
      { content: "Follow up" },
      "user@example.com",
    );

    expect(result).toEqual({ draftId: "" });
    expect(gmailMailMock.draftEmail).not.toHaveBeenCalled();
  });
});

describe("GmailProvider.getLabels", () => {
  it("returns visible user labels by default", async () => {
    vi.spyOn(gmailLabelModule, "getLabels").mockResolvedValue([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
      {
        id: "label-hidden",
        name: "Hidden",
        type: "user",
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
      {
        id: "SYSTEM",
        name: "Inbox",
        type: "system",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    ] as any);

    const provider = new GmailProvider({} as any);

    await expect(provider.getLabels()).resolves.toEqual([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        threadsTotal: undefined,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    ]);
  });

  it("can include hidden user labels for hidden-aware callers", async () => {
    vi.spyOn(gmailLabelModule, "getLabels").mockResolvedValue([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
      {
        id: "label-hidden",
        name: "Hidden",
        type: "user",
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
    ] as any);

    const provider = new GmailProvider({} as any);

    await expect(provider.getLabels({ includeHidden: true })).resolves.toEqual([
      {
        id: "label-visible",
        name: "Visible",
        type: "user",
        threadsTotal: undefined,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
      {
        id: "label-hidden",
        name: "Hidden",
        type: "user",
        threadsTotal: undefined,
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
      },
    ]);
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
