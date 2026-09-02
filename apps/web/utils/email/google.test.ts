import { afterEach, describe, expect, it, vi } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import type { EmailThread } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { GmailLabel } from "@/utils/gmail/label";
import * as gmailLabelModule from "@/utils/gmail/label";
import * as gmailThreadModule from "@/utils/gmail/thread";
import { GmailProvider } from "./google";

const {
  envMock,
  gmailMailMock,
  gmailDraftMock,
  gmailSignatureMock,
  bulkActionTrackingMock,
} = vi.hoisted(() => ({
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
  gmailDraftMock: {
    getDraft: vi.fn(),
    deleteDraft: vi.fn(),
    sendDraft: vi.fn(),
  },
  gmailSignatureMock: {
    getGmailSignatures: vi.fn().mockResolvedValue([]),
  },
  bulkActionTrackingMock: {
    publishBulkActionToTinybird: vi.fn().mockResolvedValue(undefined),
    updateEmailMessagesForSender: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/gmail/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gmail/mail")>();
  return { ...actual, ...gmailMailMock };
});

vi.mock("@/utils/gmail/draft", () => gmailDraftMock);

vi.mock("@/utils/gmail/signature-settings", () => gmailSignatureMock);
vi.mock("@/utils/email/bulk-action-tracking", () => bulkActionTrackingMock);

describe("GmailProvider.sendEmail", () => {
  it("returns the provider message ID", async () => {
    gmailMailMock.sendEmailWithPlainText.mockResolvedValueOnce({
      data: { id: "sent-message-1" },
    });
    const provider = new GmailProvider({} as any);

    await expect(
      provider.sendEmail({
        to: "recipient@example.com",
        subject: "Subject",
        messageText: "Message",
      }),
    ).resolves.toEqual({ messageId: "sent-message-1" });
  });

  it("fails when the provider omits the message ID", async () => {
    gmailMailMock.sendEmailWithPlainText.mockResolvedValueOnce({ data: {} });
    const provider = new GmailProvider({} as any);

    await expect(
      provider.sendEmail({
        to: "recipient@example.com",
        subject: "Subject",
        messageText: "Message",
      }),
    ).rejects.toThrow("Provider did not return a sent message ID");
  });
});

describe("GmailProvider.bulkArchiveThreads", () => {
  it("archives all supplied messages with one Gmail batch modification", async () => {
    const batchModify = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider(createGmailClient({ batchModify }));

    const result = await provider.bulkArchiveThreads(
      [
        { threadId: "thread-1", messageIds: ["message-1", "message-2"] },
        { threadId: "thread-2", messageIds: ["message-3"] },
      ],
      "owner@example.com",
    );

    expect(batchModify).toHaveBeenCalledTimes(1);
    expect(batchModify).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        ids: ["message-1", "message-2", "message-3"],
        removeLabelIds: [GmailLabel.INBOX],
      },
    });
    expect(
      bulkActionTrackingMock.publishBulkActionToTinybird,
    ).toHaveBeenCalledWith({
      threadIds: ["thread-1", "thread-2"],
      action: "archive",
      ownerEmail: "owner@example.com",
    });
    expect(result).toEqual({
      succeededThreadIds: ["thread-1", "thread-2"],
      failedThreadIds: [],
    });
  });
});

describe("GmailProvider snapshot mutations", () => {
  it("adds an archive label in the same Gmail batch modification", async () => {
    const batchModify = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider(createGmailClient({ batchModify }));

    await provider.archiveMessages(["one", "two"], "label-id");

    expect(batchModify).toHaveBeenCalledOnce();
    expect(batchModify).toHaveBeenCalledWith({
      userId: "me",
      requestBody: {
        ids: ["one", "two"],
        addLabelIds: ["label-id"],
        removeLabelIds: [GmailLabel.INBOX],
      },
    });
  });

  it("deduplicates and chunks archived message IDs", async () => {
    const batchModify = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider(createGmailClient({ batchModify }));
    const ids = Array.from({ length: 1001 }, (_, index) => `message-${index}`);

    await provider.archiveMessages([...ids, "message-0"]);

    expect(batchModify).toHaveBeenCalledTimes(2);
    expect(batchModify.mock.calls[0]?.[0]).toEqual({
      userId: "me",
      requestBody: {
        ids: ids.slice(0, 1000),
        removeLabelIds: [GmailLabel.INBOX],
      },
    });
    expect(batchModify.mock.calls[1]?.[0]?.requestBody.ids).toEqual([
      "message-1000",
    ]);
  });

  it("trashes each unique captured message", async () => {
    const trash = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider(createGmailClient({ trash }));

    await provider.trashMessages(["one", "one", "two"]);

    expect(trash).toHaveBeenCalledTimes(2);
    expect(trash).toHaveBeenCalledWith({ userId: "me", id: "one" });
    expect(trash).toHaveBeenCalledWith({ userId: "me", id: "two" });
  });

  it("bounds concurrent captured-message trash requests", async () => {
    let active = 0;
    let peakActive = 0;
    const trash = vi.fn().mockImplementation(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { data: {} };
    });
    const provider = new GmailProvider(createGmailClient({ trash }));

    await provider.trashMessages(
      Array.from({ length: 12 }, (_, index) => `message-${index}`),
    );

    expect(trash).toHaveBeenCalledTimes(12);
    expect(peakActive).toBe(5);
  });

  it("restores captured archive and trash snapshots", async () => {
    const batchModify = vi.fn().mockResolvedValue({ data: {} });
    const untrash = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider(
      createGmailClient({ batchModify, untrash }),
    );

    await provider.unarchiveMessages(["one", "one", "two"]);
    await provider.untrashMessages(["one", "one", "two"]);

    expect(batchModify).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { ids: ["one", "two"], addLabelIds: [GmailLabel.INBOX] },
    });
    expect(untrash).toHaveBeenCalledTimes(2);
  });

  it.each([
    [true, { removeLabelIds: [GmailLabel.UNREAD] }],
    [false, { addLabelIds: [GmailLabel.UNREAD] }],
  ])("sets captured messages read=%s", async (read, labels) => {
    const batchModify = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider(createGmailClient({ batchModify }));

    await provider.markMessagesReadState(["one", "one", "two"], read);

    expect(batchModify).toHaveBeenCalledOnce();
    expect(batchModify).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { ids: ["one", "two"], ...labels },
    });
  });
});

describe("GmailProvider.getThread", () => {
  it("parses the messages returned with the thread without fetching them again", async () => {
    const threadGet = vi.fn().mockResolvedValue({
      data: {
        historyId: "history-1",
        id: "thread-1",
        messages: [
          {
            historyId: "history-1",
            id: "message-1",
            internalDate: "1767225600000",
            labelIds: [GmailLabel.INBOX],
            payload: {
              body: {},
              headers: [
                { name: "From", value: "sender@example.com" },
                { name: "Subject", value: "Subject" },
              ],
              mimeType: "text/plain",
            },
            snippet: "Preview",
            threadId: "thread-1",
          },
        ],
        snippet: "Thread preview",
      },
    });
    const messageGet = vi.fn();
    const provider = new GmailProvider({
      users: {
        messages: { get: messageGet },
        threads: { get: threadGet },
      },
    } as unknown as gmail_v1.Gmail);

    const thread = await provider.getThread("thread-1");

    expect(threadGet).toHaveBeenCalledOnce();
    expect(messageGet).not.toHaveBeenCalled();
    expect(thread).toMatchObject({
      historyId: "history-1",
      id: "thread-1",
      messages: [{ id: "message-1", subject: "Subject" }],
      snippet: "Thread preview",
    });
  });

  it("excludes drafts by default and includes them when requested", async () => {
    const threadGet = vi.fn().mockResolvedValue({
      data: {
        id: "thread-1",
        messages: [
          {
            id: "message-1",
            labelIds: [GmailLabel.INBOX],
            payload: { body: {}, headers: [], mimeType: "text/plain" },
            threadId: "thread-1",
          },
          {
            id: "draft-1",
            labelIds: [GmailLabel.DRAFT],
            payload: { body: {}, headers: [], mimeType: "text/plain" },
            threadId: "thread-1",
          },
        ],
      },
    });
    const provider = new GmailProvider({
      users: { threads: { get: threadGet } },
    } as unknown as gmail_v1.Gmail);

    const thread = await provider.getThread("thread-1");
    const threadWithDrafts = await provider.getThread("thread-1", {
      includeDrafts: true,
    });

    expect(thread.messages.map((message) => message.id)).toEqual(["message-1"]);
    expect(threadWithDrafts.messages.map((message) => message.id)).toEqual([
      "message-1",
      "draft-1",
    ]);
  });
});

describe("GmailProvider.getLatestMessageInThread", () => {
  afterEach(() => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
    vi.clearAllMocks();
    gmailMailMock.draftEmail.mockResolvedValue({ data: { id: "draft-1" } });
    gmailSignatureMock.getGmailSignatures.mockResolvedValue([]);
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

  it("passes Gmail send-as aliases when creating drafts", async () => {
    gmailSignatureMock.getGmailSignatures.mockResolvedValue([
      {
        email: "user@example.com",
        signature: "",
        isDefault: true,
      },
      {
        email: "alias@example.com",
        signature: "",
        isDefault: false,
      },
    ]);
    const provider = new GmailProvider({} as any);
    const message = createParsedMessage({
      id: "message-1",
      internalDate: "1000",
    });
    const args = { content: "Follow up" };

    const result = await provider.draftEmail(message, args, "user@example.com");

    expect(result).toEqual({ draftId: "draft-1" });
    expect(gmailMailMock.draftEmail).toHaveBeenCalledWith(
      expect.anything(),
      message,
      args,
      ["user@example.com", "alias@example.com"],
    );
  });
});

describe("GmailProvider.getSentMessageIds", () => {
  it("filters sent messages with Gmail labelIds and second-accurate date bounds", async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        messages: [{ id: "message-1", threadId: "thread-1" }],
        nextPageToken: "next-page",
      },
    });
    const provider = new GmailProvider({
      users: { messages: { list } },
    } as any);

    const result = await provider.getSentMessageIds({
      maxResults: 50,
      after: new Date("2026-03-31T12:00:00.000Z"),
      before: new Date("2026-04-30T17:00:00.000Z"),
      pageToken: "page-1",
    });

    expect(list).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 50,
      q: "after:1774958399 before:1777568401",
      pageToken: "page-1",
      labelIds: [GmailLabel.SENT],
    });
    expect(result).toEqual({
      messages: [{ id: "message-1", threadId: "thread-1" }],
      nextPageToken: "next-page",
    });
  });

  it("omits the Gmail search query when no date range is provided", async () => {
    const list = vi.fn().mockResolvedValue({ data: { messages: [] } });
    const provider = new GmailProvider({
      users: { messages: { list } },
    } as any);

    await provider.getSentMessageIds({
      maxResults: 50,
    });

    expect(list).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 50,
      q: undefined,
      pageToken: undefined,
      labelIds: [GmailLabel.SENT],
    });
  });
});

describe("GmailProvider.getThreadsWithQuery", () => {
  it("uses multiple label IDs in preference to the legacy single label", async () => {
    const getThreadsWithNextPageToken = vi
      .spyOn(gmailThreadModule, "getThreadsWithNextPageToken")
      .mockResolvedValue({ threads: [], nextPageToken: undefined });
    vi.spyOn(gmailThreadModule, "getThreadsBatch").mockResolvedValue([]);
    const provider = new GmailProvider({
      context: {
        _options: {
          auth: { credentials: { access_token: "access-token" } },
        },
      },
    } as any);

    await provider.getThreadsWithQuery({
      query: {
        labelId: "Label_123",
        labelIds: ["Label_123", GmailLabel.INBOX],
      },
    });

    expect(getThreadsWithNextPageToken).toHaveBeenCalledWith(
      expect.objectContaining({
        labelIds: ["Label_123", GmailLabel.INBOX],
      }),
    );
  });

  it("uses Gmail metadata format for list requests", async () => {
    vi.spyOn(
      gmailThreadModule,
      "getThreadsWithNextPageToken",
    ).mockResolvedValue({
      threads: [{ id: "thread-1" }],
      nextPageToken: undefined,
    });
    const getThreadsBatch = vi
      .spyOn(gmailThreadModule, "getThreadsBatch")
      .mockResolvedValue([]);
    const provider = new GmailProvider({
      context: {
        _options: {
          auth: { credentials: { access_token: "access-token" } },
        },
      },
    } as any);

    await provider.getThreadsWithQuery({ messageFormat: "metadata" });

    expect(getThreadsBatch).toHaveBeenCalledWith(
      ["thread-1"],
      "access-token",
      expect.anything(),
      { format: "metadata" },
    );
  });
});

describe("GmailProvider.searchThreads", () => {
  it("passes the free-text query through unscoped", async () => {
    const getThreadsWithNextPageToken = vi
      .spyOn(gmailThreadModule, "getThreadsWithNextPageToken")
      .mockResolvedValue({ threads: [], nextPageToken: undefined });
    vi.spyOn(gmailThreadModule, "getThreadsBatch").mockResolvedValue([]);
    const provider = new GmailProvider({
      context: {
        _options: {
          auth: { credentials: { access_token: "access-token" } },
        },
      },
    } as any);

    await provider.searchThreads({ query: "invoice from:billing@example.com" });

    expect(getThreadsWithNextPageToken).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "invoice from:billing@example.com",
        labelIds: [],
      }),
    );
  });
});

describe("GmailProvider.updateDraft", () => {
  it("keeps Gmail threading metadata and MIME-encodes non-ASCII subjects", async () => {
    const update = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider({
      users: { drafts: { update } },
    } as any);
    const subject = "Re: ok but you NEED to share your secrets 👀🔍";

    gmailDraftMock.getDraft.mockResolvedValueOnce(
      createParsedMessage({
        id: "draft-message-1",
        internalDate: "1000",
        threadId: "thread-special",
        subject,
        labelIds: [GmailLabel.DRAFT],
        headers: {
          to: "sender@example.com",
          subject,
          "in-reply-to": "<original@example.com>",
          references: "<root@example.com> <original@example.com>",
        },
      }),
    );

    await provider.updateDraft("r-123", {
      subject,
      messageHtml: "<p>Edited response.</p>",
    });

    expect(update).toHaveBeenCalledWith({
      userId: "me",
      id: "r-123",
      requestBody: {
        message: {
          threadId: "thread-special",
          raw: expect.any(String),
        },
      },
    });

    const raw = update.mock.calls[0]?.[0]?.requestBody?.message?.raw;
    const decodedMessage = decodeBase64Url(raw);

    expect(decodedMessage).toContain("Subject: =?UTF-8?");
    expect(decodedMessage).toContain("In-Reply-To: <original@example.com>");
    expect(decodedMessage).toContain(
      "References: <root@example.com> <original@example.com>",
    );
    expect(decodedMessage).toContain("Edited response.");
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

describe("GmailProvider.deleteLabel", () => {
  it("treats an already-deleted label as success", async () => {
    const deleteLabel = vi.fn().mockRejectedValue(
      Object.assign(new Error("Label not found"), {
        code: 404,
      }),
    );
    const provider = new GmailProvider({
      users: { labels: { delete: deleteLabel } },
    } as any);

    await expect(provider.deleteLabel("label-1")).resolves.toBeUndefined();
    expect(deleteLabel).toHaveBeenCalledWith({
      userId: "me",
      id: "label-1",
    });
  });
});

describe("GmailProvider.updateLabel", () => {
  it("updates a label name and Gmail color in one request", async () => {
    const patch = vi.fn().mockResolvedValue({ data: {} });
    const provider = new GmailProvider({
      users: { labels: { patch } },
    } as any);

    await provider.updateLabel("label-1", {
      name: "Receipts",
      color: {
        backgroundColor: "#e66550",
        textColor: "#000000",
      },
    });

    expect(patch).toHaveBeenCalledWith({
      userId: "me",
      id: "label-1",
      requestBody: {
        name: "Receipts",
        color: {
          backgroundColor: "#e66550",
          textColor: "#000000",
        },
      },
    });
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
  threadId = "thread-1",
  labelIds,
  subject = "Subject",
  headers,
}: {
  id: string;
  internalDate: string;
  threadId?: string;
  labelIds?: string[];
  subject?: string;
  headers?: Partial<ParsedMessage["headers"]>;
}): ParsedMessage {
  return {
    id,
    threadId,
    labelIds,
    snippet: "",
    historyId: "history-1",
    inline: [],
    headers: {
      subject,
      from: "sender@example.com",
      to: "recipient@example.com",
      date: "Mon, 01 Jan 2026 00:00:00 +0000",
      ...headers,
    },
    subject,
    date: "Mon, 01 Jan 2026 00:00:00 +0000",
    internalDate,
    textPlain: "",
    textHtml: "",
  };
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createGmailClient(
  messages: Partial<gmail_v1.Gmail["users"]["messages"]>,
) {
  return { users: { messages } } as unknown as gmail_v1.Gmail;
}
