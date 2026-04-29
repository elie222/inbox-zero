import type { Message } from "@microsoft/microsoft-graph-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as outlookMessageModule from "@/utils/outlook/message";
import * as outlookLabelModule from "@/utils/outlook/label";
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
    archive: "archive-folder-id",
    drafts: "drafts-folder-id",
    deleteditems: "trash-folder-id",
    junkemail: "spam-folder-id",
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
    archive: "archive-folder-id",
    drafts: "drafts-folder-id",
    deleteditems: "trash-folder-id",
    junkemail: "spam-folder-id",
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
  it("filters returned threads by explicit labelIds", async () => {
    getFolderIdsMock.mockResolvedValue({
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

  it("keeps paging until explicit labelIds produce enough matching threads", async () => {
    getFolderIdsMock.mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map([["To Reply", "label-to-reply"]]),
    );

    const provider = new OutlookProvider(
      createMockOutlookClient([], {
        responsesByApiPath: {
          "/me/messages": {
            value: [
              createMessage({
                id: "message-first-page",
                conversationId: "thread-first-page",
                parentFolderId: "folder-inbox",
              }),
            ],
            "@odata.nextLink":
              "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next",
          },
          "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next": {
            value: [
              createMessage({
                id: "message-second-page",
                conversationId: "thread-second-page",
                categories: ["To Reply"],
                parentFolderId: "folder-inbox",
              }),
            ],
          },
        },
      }),
    );

    const result = await provider.getThreadsWithQuery({
      query: { labelIds: ["label-to-reply"] },
      maxResults: 1,
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([
      "thread-second-page",
    ]);
  });

  it("returns a resumable token when a buffered page has more matches than fit in maxResults", async () => {
    getFolderIdsMock.mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map([["To Reply", "label-to-reply"]]),
    );

    const client = createMockOutlookClient([], {
      responsesByApiPath: {
        "/me/messages": {
          value: [
            createMessage({
              id: "message-first-page",
              conversationId: "thread-first-page",
              parentFolderId: "folder-inbox",
            }),
          ],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-2",
        },
        "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-2": {
          value: [
            createMessage({
              id: "message-second-page-a",
              conversationId: "thread-second-page-a",
              categories: ["To Reply"],
              parentFolderId: "folder-inbox",
            }),
            createMessage({
              id: "message-second-page-b",
              conversationId: "thread-second-page-b",
              categories: ["To Reply"],
              parentFolderId: "folder-inbox",
            }),
          ],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-3",
        },
        "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-3": {
          value: [],
        },
      },
    });
    const provider = new OutlookProvider(client);

    const firstPage = await provider.getThreadsWithQuery({
      query: { labelIds: ["label-to-reply"] },
      maxResults: 1,
    });

    expect(firstPage.threads.map((thread) => thread.id)).toEqual([
      "thread-second-page-a",
    ]);
    expect(firstPage.nextPageToken).toContain("outlook-threads:");

    const secondPage = await provider.getThreadsWithQuery({
      query: { labelIds: ["label-to-reply"] },
      maxResults: 1,
      pageToken: firstPage.nextPageToken,
    });

    expect(secondPage.threads.map((thread) => thread.id)).toEqual([
      "thread-second-page-b",
    ]);
    expect(secondPage.nextPageToken).toBe(
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=page-3",
    );
  });

  it("excludes threads with matching label names", async () => {
    getFolderIdsMock.mockResolvedValue({
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

  it("does not emit a folder filter when category lookup for labelId fails", async () => {
    getFolderIdsMock.mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map([["To Reply", "label-to-reply"]]),
    );
    vi.spyOn(outlookLabelModule, "getLabelById").mockRejectedValue(
      new Error("lookup failed"),
    );

    const client = createMockOutlookClient([
      createMessage({
        id: "message-with-category",
        conversationId: "thread-with-category",
        categories: ["To Reply"],
        parentFolderId: "folder-inbox",
      }),
    ]);
    const provider = new OutlookProvider(client);

    const result = await provider.getThreadsWithQuery({
      query: { labelId: "label-to-reply" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([
      "thread-with-category",
    ]);
    expect(client.getRequestLog()[0]?.filter).toBeUndefined();
  });

  it("matches explicit category labelIds even when the category map is unavailable", async () => {
    getFolderIdsMock.mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map(),
    );
    vi.spyOn(outlookLabelModule, "getLabelById").mockResolvedValue({
      id: "label-to-reply",
      displayName: "To Reply",
    } as Awaited<ReturnType<typeof outlookLabelModule.getLabelById>>);

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "message-with-category",
          conversationId: "thread-with-category",
          categories: ["To Reply"],
          parentFolderId: "folder-inbox",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { labelIds: ["label-to-reply"] },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([
      "thread-with-category",
    ]);
  });

  it("ignores unresolved required category labelIds when only some IDs can be resolved", async () => {
    getFolderIdsMock.mockResolvedValue({
      inbox: "folder-inbox",
      archive: "folder-archive",
      drafts: "folder-drafts",
      deleteditems: "folder-trash",
      junkemail: "folder-spam",
      sentitems: "folder-sent",
    });
    vi.spyOn(outlookMessageModule, "getCategoryMap").mockResolvedValue(
      new Map(),
    );
    vi.spyOn(outlookLabelModule, "getLabelById").mockImplementation(
      async ({ id }) => {
        if (id === "label-to-reply") {
          return {
            id,
            displayName: "To Reply",
          } as Awaited<ReturnType<typeof outlookLabelModule.getLabelById>>;
        }

        return {
          id,
          displayName: undefined,
        } as Awaited<ReturnType<typeof outlookLabelModule.getLabelById>>;
      },
    );

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "message-with-category",
          conversationId: "thread-with-category",
          categories: ["To Reply"],
          parentFolderId: "folder-inbox",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { labelIds: ["label-to-reply", "label-without-name"] },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual([
      "thread-with-category",
    ]);
  });

  it("excludes folder-backed labels when excludeLabelNames targets them", async () => {
    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "sent-message",
          conversationId: "thread-sent",
          parentFolderId: "sent-folder-id",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { type: "sent", excludeLabelNames: ["SENT"] },
    });

    expect(result.threads).toEqual([]);
  });

  it("skips category lookup when the query does not need category labels", async () => {
    const getCategoryMapSpy = vi.spyOn(outlookMessageModule, "getCategoryMap");

    const provider = new OutlookProvider(
      createMockOutlookClient([
        createMessage({
          id: "sent-message",
          conversationId: "thread-sent",
          parentFolderId: "sent-folder-id",
        }),
      ]),
    );

    const result = await provider.getThreadsWithQuery({
      query: { type: "sent" },
    });

    expect(result.threads.map((thread) => thread.id)).toEqual(["thread-sent"]);
    expect(getCategoryMapSpy).not.toHaveBeenCalled();
  });
});

function createMockOutlookClient(
  messages: Message[],
  options?: {
    categoryMapCache?: Map<string, string> | null;
    folderIdCache?: Record<string, string> | null;
    responsesByApiPath?: Record<
      string,
      { value: Message[]; "@odata.nextLink"?: string }
    >;
  },
) {
  let categoryMapCache = options?.categoryMapCache ?? null;
  let folderIdCache = options?.folderIdCache ?? null;
  const requestLog: Array<{ apiPath: string; filter?: string }> = [];

  return {
    getClient: () => ({
      api: (apiPath: string) => {
        let filterValue: string | undefined;
        const request = {
          filter: (value: string) => {
            filterValue = value;
            return request;
          },
          select: () => request,
          top: () => request,
          orderby: () => request,
          get: async () => {
            requestLog.push({ apiPath, filter: filterValue });
            return (
              options?.responsesByApiPath?.[apiPath] || { value: messages }
            );
          },
        };

        return request;
      },
    }),
    getCategoryMapCache: () => categoryMapCache,
    setCategoryMapCache: (value: Map<string, string>) => {
      categoryMapCache = value;
    },
    getFolderIdCache: () => folderIdCache,
    setFolderIdCache: (value: Record<string, string>) => {
      folderIdCache = value;
    },
    getRequestLog: () => requestLog,
  } as any;
}

function createMessage(input: {
  id: string;
  conversationId?: string;
  receivedDateTime?: string | undefined;
  isDraft?: boolean;
  bodyContentType?: "text" | "html";
  bodyContent?: string;
  categories?: string[];
  parentFolderId?: string;
  isRead?: boolean;
}): Message {
  const {
    id,
    conversationId = "thread-1",
    isDraft = false,
    bodyContentType = "text",
    bodyContent = "",
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
      contentType: bodyContentType,
      content: bodyContent,
    },
    categories,
    parentFolderId,
    hasAttachments: false,
  };
}
