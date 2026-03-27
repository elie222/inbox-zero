import type { Message } from "@microsoft/microsoft-graph-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlookProvider } from "./microsoft";

vi.mock("server-only", () => ({}));

const { envMock, outlookMailMock, getFolderIdsMock } = vi.hoisted(() => ({
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
  getFolderIdsMock: vi.fn().mockResolvedValue({
    inbox: "inbox-folder-id",
    sentitems: "sent-folder-id",
  }),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/outlook/mail", () => outlookMailMock);

vi.mock("@/utils/outlook/message", async () => {
  const actual = await vi.importActual<
    typeof import("@/utils/outlook/message")
  >("@/utils/outlook/message");

  return {
    ...actual,
    getFolderIds: getFolderIdsMock,
  };
});

afterEach(() => {
  vi.useRealTimers();
  envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
  vi.clearAllMocks();
  outlookMailMock.draftEmail.mockResolvedValue({ id: "draft-1" });
  getFolderIdsMock.mockResolvedValue({
    inbox: "inbox-folder-id",
    sentitems: "sent-folder-id",
  });
});

describe("OutlookProvider.getLatestMessageInThread", () => {
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
  it("reuses the shared Outlook message conversion path", async () => {
    const provider = new OutlookProvider(
      createMockOutlookClient(
        [
          createMessage({
            id: "message-1",
            receivedDateTime: "2026-01-01T00:00:00.000Z",
            isDraft: false,
            bodyContentType: "html",
            bodyContent: "<p>Hello</p>",
            categories: ["Priority"],
            parentFolderId: "inbox-folder-id",
          }),
        ],
        {
          categoryMapCache: new Map([["Priority", "category-1"]]),
        },
      ),
    );

    const result = await provider.getThreadsWithQuery({ query: {} });
    const message = result.threads[0]?.messages[0];

    expect(message).toMatchObject({
      id: "message-1",
      threadId: "thread-1",
      bodyContentType: "html",
      labelIds: ["INBOX", "category-1"],
      headers: {
        from: "Sender <sender@example.com>",
        to: "Recipient <recipient@example.com>",
        subject: "Subject",
        date: "2026-01-01T00:00:00.000Z",
        "message-id": "<message-1@example.com>",
      },
      rawRecipients: {
        from: {
          emailAddress: {
            name: "Sender",
            address: "sender@example.com",
          },
        },
        toRecipients: [
          {
            emailAddress: {
              name: "Recipient",
              address: "recipient@example.com",
            },
          },
        ],
        ccRecipients: [],
      },
    });
  });

  it("preserves folder labels on paginated pages", async () => {
    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "message-2",
          receivedDateTime: "2026-01-02T00:00:00.000Z",
          isDraft: false,
          parentFolderId: "inbox-folder-id",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: {},
      pageToken: "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc",
    });

    expect(result.threads[0]?.messages[0]?.labelIds).toContain("INBOX");
  });

  it("preserves sent labels for sent queries", async () => {
    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "message-3",
          receivedDateTime: "2026-01-03T00:00:00.000Z",
          isDraft: false,
          parentFolderId: "sent-folder-id",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { type: "sent" },
    });

    expect(result.threads[0]?.messages[0]?.labelIds).toContain("SENT");
  });
});

function createMockOutlookClient(
  messages: Message[],
  options?: { categoryMapCache?: Map<string, string> | null },
) {
  return {
    getClient: () => ({
      api: () => {
        const request = {
          filter: () => request,
          select: () => request,
          top: () => request,
          orderby: () => request,
          get: async () => ({ value: messages }),
        };

        return request;
      },
    }),
    getCategoryMapCache: () => options?.categoryMapCache ?? null,
  } as any;
}

function createMessage({
  id,
  receivedDateTime,
  isDraft,
  bodyContentType = "text",
  bodyContent = "",
  categories = [],
  parentFolderId,
}: {
  id: string;
  receivedDateTime: string | undefined;
  isDraft: boolean;
  bodyContentType?: "text" | "html";
  bodyContent?: string;
  categories?: string[];
  parentFolderId?: string;
}): Message {
  return {
    id,
    conversationId: "thread-1",
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
    isRead: true,
    body: {
      contentType: bodyContentType,
      content: bodyContent,
    },
    categories,
    parentFolderId,
    hasAttachments: false,
  };
}
