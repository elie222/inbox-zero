import type { Message } from "@microsoft/microsoft-graph-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as outlookMessageModule from "@/utils/outlook/message";
import { OutlookProvider } from "./microsoft";

vi.mock("server-only", () => ({}));

const { envMock, outlookMailMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    EMAIL_ENCRYPT_SECRET: "test-encrypt-secret",
    EMAIL_ENCRYPT_SALT: "test-encrypt-salt",
  },
  outlookMailMock: {
    draftEmail: vi.fn().mockResolvedValue({ id: "draft-1" }),
    forwardEmail: vi.fn(),
    replyToEmail: vi.fn(),
    sendEmailWithPlainText: vi.fn(),
    sendEmailWithHtml: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/outlook/mail", () => outlookMailMock);

describe("OutlookProvider.getLatestMessageInThread", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
  });

  it("uses converted date fallback when receivedDateTime is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T00:00:00Z"));

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "older-with-date",
          receivedDateTime: "2026-01-01T00:00:00.000Z",
          isDraft: false,
        }),
        createMessage({
          id: "missing-date",
          receivedDateTime: undefined,
          isDraft: false,
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest?.id).toBe("missing-date");
  });

  it("returns null when all messages are drafts", async () => {
    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "draft-1",
          receivedDateTime: "2026-01-01T00:00:00.000Z",
          isDraft: true,
        }),
        createMessage({
          id: "draft-2",
          receivedDateTime: undefined,
          isDraft: true,
        }),
      ]),
    );

    const latest = await provider.getLatestMessageInThread("thread-1");

    expect(latest).toBeNull();
  });

  it("no-ops draftEmail when auto-drafting is disabled", async () => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = true;
    const provider = new OutlookProvider(createMockOutlookClient([]));

    const result = await provider.draftEmail(
      {
        id: "message-1",
        threadId: "thread-1",
        labelIds: [],
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
        internalDate: "1000",
        textPlain: "",
        textHtml: "",
      },
      { content: "Follow up" },
      "user@example.com",
    );

    expect(result).toEqual({ draftId: "" });
    expect(outlookMailMock.draftEmail).not.toHaveBeenCalled();
  });
});

describe("OutlookProvider.getThreadsWithQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("filters returned threads by explicit labelIds", async () => {
    vi.spyOn(outlookMessageModule, "getFolderIds").mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map([
        ["To Reply", "label-to-reply"],
        ["Processed", "label-processed"],
      ]),
    );

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "message-with-label",
          conversationId: "thread-with-label",
          categories: ["To Reply"],
          parentFolderId: "folder-inbox",
          isRead: false,
        }),
        createMessage({
          id: "message-without-label",
          conversationId: "thread-without-label",
          parentFolderId: "folder-inbox",
          isRead: false,
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { labelIds: ["label-to-reply"] },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([
      "thread-with-label",
    ]);
  });

  it("excludes threads with matching label names", async () => {
    vi.spyOn(outlookMessageModule, "getFolderIds").mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map([
        ["To Reply", "label-to-reply"],
        ["Processed", "label-processed"],
      ]),
    );

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "processed-message",
          conversationId: "thread-processed",
          categories: ["Processed"],
          parentFolderId: "folder-inbox",
        }),
        createMessage({
          id: "clean-message",
          conversationId: "thread-clean",
          parentFolderId: "folder-inbox",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { excludeLabelNames: ["Processed"] },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["thread-clean"]);
  });
});

function createMockOutlookClient(messages: Message[]) {
  const request = {
    filter: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    top: vi.fn().mockReturnThis(),
    orderby: vi.fn().mockReturnThis(),
    expand: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ value: messages }),
  };

  return {
    getClient: () => ({
      api: () => request,
    }),
  } as any;
}

function createMessage(input: {
  id: string;
  conversationId?: string;
  receivedDateTime?: string | undefined;
  isDraft?: boolean;
  categories?: string[];
  parentFolderId?: string;
  isRead?: boolean;
}): Message {
  const {
    id,
    conversationId = "thread-1",
    isDraft = false,
    categories = [],
    parentFolderId,
    isRead = true,
  } = input;
  const receivedDateTime = Object.hasOwn(input, "receivedDateTime")
    ? input.receivedDateTime
    : "2026-01-01T00:00:00.000Z";

  return {
    id,
    conversationId,
    conversationIndex: null,
    internetMessageId: `<${id}@example.com>`,
    subject: "Subject",
    bodyPreview: "",
    from: {
      emailAddress: {
        name: "Sender",
        address: "sender@example.com",
      },
    },
    sender: undefined,
    toRecipients: [
      {
        emailAddress: {
          name: "Recipient",
          address: "recipient@example.com",
        },
      },
    ],
    ccRecipients: [],
    receivedDateTime,
    isDraft,
    isRead,
    body: {
      contentType: "text",
      content: "",
    },
    categories,
    parentFolderId,
    hasAttachments: false,
  };
}
