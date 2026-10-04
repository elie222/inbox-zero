import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FastmailProvider } from "@/utils/email/fastmail";
import type { FastmailClient, JMAPMethodCall } from "@/utils/fastmail/client";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

vi.mock("@/utils/prisma");
vi.mock("@/utils/fastmail/client", () => ({
  getAccessTokenFromClient: () => "token",
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("Fastmail mail operations", () => {
  it.each([
    "searchMessages",
    "getMessagesWithPagination",
  ] as const)("%s translates search filters instead of searching for literal Gmail operators", async (method) => {
    const { provider, calls } = createProvider();
    const result = await provider[method]({
      query: "is:unread in:inbox newer_than:2d",
      maxResults: 20,
    });
    expect(result.messages).toHaveLength(1);
    const query = calls.find(([name]) => name === "Email/query");
    expect(query?.[1].filter).toMatchObject({
      operator: "AND",
      conditions: expect.arrayContaining([
        {
          operator: "AND",
          conditions: [
            { notKeyword: "$seen" },
            { inMailbox: "inbox" },
            { after: expect.any(String) },
          ],
        },
      ]),
    });
  });

  it("fetches inbox messages without requesting a forbidden parsed unsubscribe header", async () => {
    const { provider, calls } = createProvider();

    const messages = await provider.getInboxMessages(20);

    expect(messages).toHaveLength(1);
    expect(messages[0].headers["list-unsubscribe"]).toBe(
      "<https://example.com/unsubscribe>, <mailto:unsubscribe@example.com>",
    );
    const emailGet = calls.find(([name]) => name === "Email/get");
    expect(emailGet?.[1].properties).toContain("header:List-Unsubscribe");
  });

  it.each([
    { savedDraft: false, attachmentMode: "absent" },
    { savedDraft: false, attachmentMode: "empty" },
    { savedDraft: false, attachmentMode: "added" },
    { savedDraft: true, attachmentMode: "absent" },
    { savedDraft: true, attachmentMode: "empty" },
    { savedDraft: true, attachmentMode: "added" },
  ])("preserves forwarded files and inline images ($savedDraft, $attachmentMode)", async ({
    savedDraft,
    attachmentMode,
  }) => {
    const { provider, calls } = createProvider({
      forwardedAttachments: true,
      draft: savedDraft,
      emailAccountId: "owner",
    });
    const uploaded: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const bytes = init.body as Uint8Array;
          uploaded.push(Buffer.from(bytes).toString());
          return Response.json({
            blobId: `uploaded-${uploaded.length}`,
            size: bytes.length,
          });
        }
        return new Response(
          url.includes("original-file") ? "original report" : "inline image",
        );
      }),
    );
    prisma.fastmailDraft.upsert.mockResolvedValue({
      id: "stable",
      emailAccountId: "owner",
      messageId: "draft",
      version: 1,
    } as never);
    prisma.fastmailDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.fastmailDraft.findUnique.mockResolvedValue({
      messageId: "created",
    } as never);
    const addedAttachments =
      attachmentMode === "added"
        ? [
            {
              filename: "extra.txt",
              contentType: "text/plain",
              content: Buffer.from("new file").toString("base64"),
            },
          ]
        : [];
    await provider.sendEmailWithHtml({
      to: "recipient@example.com",
      subject: "Fwd: Report",
      messageHtml: '<p>Forwarded report</p><img src="cid:chart">',
      replyToEmail: { threadId: "thread", forwardedMessageId: "original" },
      providerDraftId: savedDraft ? "stable" : undefined,
      attachments: attachmentMode === "absent" ? undefined : addedAttachments,
    });
    const created = calls.find(
      ([name, args]) => name === "Email/set" && args.create,
    )?.[1].create as Record<string, { attachments: unknown[] }>;
    expect(created.email.attachments).toEqual([
      expect.objectContaining({
        name: "report.pdf",
        type: "application/pdf",
        disposition: "attachment",
      }),
      expect.objectContaining({
        name: "chart.png",
        type: "image/png",
        disposition: "inline",
        cid: "chart",
      }),
      ...(attachmentMode === "added"
        ? [expect.objectContaining({ name: "extra.txt" })]
        : []),
    ]);
    expect(uploaded).toEqual([
      "original report",
      "inline image",
      ...(attachmentMode === "added" ? ["new file"] : []),
    ]);
    expect(
      calls.filter(([name]) => name === "EmailSubmission/set"),
    ).toHaveLength(1);
  });

  it("resets browser enumeration when its Fastmail anchor was deleted", async () => {
    const { provider, request } = createProvider();
    const source = createEmailProviderMailboxSource({
      provider,
      accountId: "owner",
    });
    const input = {
      session: { accountId: "owner", generation: "g1" },
      requestId: "bootstrap",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 1,
    };
    const first = await source.enumerate(input);
    if (first.status !== "ok" || !first.value.nextPage)
      throw new Error("Missing first page");
    request.mockRejectedValueOnce(
      new SafeError("JMAP error: anchorNotFound - Message deleted"),
    );
    await expect(
      source.enumerate({ ...input, page: first.value.nextPage }),
    ).resolves.toEqual({ status: "reset_required", scopeId: "primary" });
    await expect(source.enumerate(input)).resolves.toMatchObject({
      status: "ok",
      value: { changes: [{ key: { messageId: "message" } }] },
    });
    request.mockRejectedValueOnce(new Error("JMAP request failed: 503"));
    await expect(
      source.enumerate({ ...input, page: first.value.nextPage }),
    ).resolves.toMatchObject({ status: "paused" });
  });

  it("only reports a send after submission succeeds", async () => {
    const { provider, calls } = createProvider();
    await expect(
      provider.sendEmail({
        to: '"Recipient, One" <one@example.com>',
        subject: "Hello",
        messageText: "Body",
      }),
    ).resolves.toEqual({ messageId: "created" });
    const create = calls.find(([name]) => name === "Email/set")?.[1]
      .create as Record<string, Record<string, unknown>>;
    expect(create.email.to).toEqual([
      { email: "one@example.com", name: '"Recipient, One"' },
    ]);
    expect(create.email.mailboxIds).toEqual({ drafts: true });
    const submit = calls.find(([name]) => name === "EmailSubmission/set")?.[1];
    expect(submit?.onSuccessUpdateEmail).toEqual({
      "#submission": {
        "keywords/$draft": null,
        "mailboxIds/drafts": null,
        "mailboxIds/sent": true,
      },
    });
  });

  it("leaves rejected submissions as drafts and reports the rejection", async () => {
    const { provider } = createProvider({ submissionRejected: true });
    await expect(
      provider.sendEmail({
        to: "one@example.com",
        subject: "Hello",
        messageText: "Body",
      }),
    ).rejects.toThrow("Sending denied");
  });

  it("does not make an ambiguous submission safe to retry", async () => {
    const { provider } = createProvider({
      submissionError: new SafeError("JMAP request failed: 503"),
    });
    const error = await provider
      .sendEmail({
        to: "one@example.com",
        subject: "Hello",
        messageText: "Body",
      })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SafeError);
    expect((error as Error).message).toContain("Check Sent");
  });

  it("uses Thread/get and removes only the seen keyword when marking unread", async () => {
    const { provider, calls } = createProvider();
    await provider.markReadThread("thread", false);
    expect(calls[0]).toEqual([
      "Thread/get",
      { accountId: "account", ids: ["thread"] },
      "0",
    ]);
    expect(calls[1][1].update).toEqual({ message: { "keywords/$seen": null } });
  });

  it("preserves unrelated mailbox memberships when archiving", async () => {
    const { provider, calls } = createProvider();
    await provider.archiveMessages(["message"], "custom");
    expect(calls.at(-1)?.[1].update).toEqual({
      message: {
        "mailboxIds/inbox": null,
        "mailboxIds/archive": true,
        "mailboxIds/custom": true,
      },
    });
  });

  it("honors server batch limits", async () => {
    const { provider, calls } = createProvider();
    await provider.markMessagesStarredState(["1", "2", "3", "1"], true);
    expect(
      calls
        .filter(([name]) => name === "Email/set")
        .map(([, args]) => Object.keys(args.update as object)),
    ).toEqual([["1", "2"], ["3"]]);
  });

  it("normalizes mailbox roles and received timestamps for the shared mail engine", async () => {
    const { provider } = createProvider();
    const messages = await provider.getMessagesBatch(["message"]);
    expect(messages[0]).toMatchObject({
      labelIds: ["inbox", "INBOX", "UNREAD"],
      internalDate: String(Date.parse("2026-10-01T12:00:00Z")),
      historyId: "s1",
    });
  });

  it("uses an anchor for subsequent pages so deletions cannot shift an offset past unseen mail", async () => {
    const { provider, calls } = createProvider();
    const page = await provider.getMessagesWithPagination({ maxResults: 1 });
    expect(page.nextPageToken).toBe("anchor:message");
    await provider.getMessagesWithPagination({
      maxResults: 1,
      pageToken: page.nextPageToken,
    });
    const queries = calls.filter(([name]) => name === "Email/query");
    expect(queries[1][1]).toMatchObject({ anchor: "message", anchorOffset: 1 });
    expect(queries[1][1]).not.toHaveProperty("position");
  });

  it("translates shared system labels and split exclusions to JMAP conditions", async () => {
    const { provider, calls } = createProvider();
    await provider.getThreadsWithQuery({
      query: {
        type: "inbox",
        labelIds: ["STARRED"],
        excludeSplits: [{ matchAll: true, filters: [{ kind: "UNREAD" }] }],
      },
    });
    const query = calls.find(([name]) => name === "Email/query")?.[1];
    expect(query?.filter).toEqual({
      operator: "AND",
      conditions: [
        { inMailbox: "inbox" },
        { hasKeyword: "$flagged" },
        {
          operator: "NOT",
          conditions: [
            {
              operator: "AND",
              conditions: [{ notKeyword: "$seen" }, { inMailbox: "inbox" }],
            },
          ],
        },
      ],
    });
  });

  it("captures a baseline without reading or processing existing messages", async () => {
    const { provider, calls } = createProvider();
    await expect(
      provider.getMailboxSyncPage({ limit: 50 }),
    ).resolves.toMatchObject({
      cursor: "s1",
      upsertedMessages: [],
      reset: false,
    });
    expect(calls).toEqual([
      ["Email/get", { accountId: "account", ids: [], properties: ["id"] }, "0"],
    ]);
  });

  it("rejects local sync cursors from another account", async () => {
    const { provider } = createProvider();
    const baseline = await provider.syncLocalMail(
      { phase: "history-baseline", after: 0 },
      { emailAccountId: "owner" },
    );
    if (baseline.status !== "ok" || baseline.phase !== "history-baseline")
      throw new Error("Missing baseline");
    await expect(
      provider.syncLocalMail(
        {
          phase: "history-changes",
          after: 0,
          cursor: baseline.result.cursor,
          limit: 50,
        },
        { emailAccountId: "other" },
      ),
    ).rejects.toThrow("scope mismatch");
  });

  it("surfaces expired history rather than silently advancing past missed mail", async () => {
    const { provider, request } = createProvider();
    request.mockRejectedValueOnce(
      new Error("JMAP error: cannotCalculateChanges"),
    );
    await expect(provider.getEmailChanges("old")).rejects.toThrow(
      "cannotCalculateChanges",
    );
  });

  it("rejects a changed draft before destroying it", async () => {
    const { provider, request } = createProvider();
    request.mockResolvedValueOnce({
      methodResponses: [
        [
          "Email/set",
          {
            notDestroyed: {
              draft: { type: "forbidden", description: "Permission denied" },
            },
          },
          "0",
        ],
      ],
    });
    await expect(provider.deleteDraft("draft")).rejects.toThrow(
      "Permission denied",
    );
  });

  it("protects draft replacement against concurrent editors", async () => {
    const { provider, calls } = createProvider({
      draft: true,
      emailAccountId: "owner",
    });
    prisma.fastmailDraft.upsert.mockResolvedValue({
      id: "stable",
      emailAccountId: "owner",
      messageId: "message",
      version: 1,
    } as never);
    prisma.fastmailDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      provider.updateDraft("stable", { subject: "Changed" }),
    ).rejects.toThrow("another session");
    const deletions = calls
      .filter(([, args]) => args.destroy)
      .map(([, args]) => args.destroy);
    expect(deletions).toEqual([["created"]]);
  });
});

function createProvider(
  options: {
    submissionRejected?: boolean;
    submissionError?: Error;
    draft?: boolean;
    emailAccountId?: string;
    forwardedAttachments?: boolean;
  } = {},
) {
  const calls: JMAPMethodCall[] = [];
  const request = vi.fn(async (methods: JMAPMethodCall[]) => {
    calls.push(...methods);
    return {
      methodResponses: methods.map(([name, args, id]) => {
        let result: unknown;
        switch (name) {
          case "Mailbox/get":
            result = {
              list: ["inbox", "sent", "drafts", "trash", "junk", "archive"].map(
                (role) => ({
                  id: role,
                  name: role,
                  role,
                  totalEmails: 1,
                  unreadEmails: 1,
                }),
              ),
            };
            break;
          case "Identity/get":
            result = { list: [{ id: "identity", email: "owner@example.com" }] };
            break;
          case "Thread/get":
            result = { list: [{ id: "thread", emailIds: ["message"] }] };
            break;
          case "Email/query":
            result = { ids: ["message"], position: 0, total: 2 };
            break;
          case "Email/get":
            if (
              (args.properties as string[] | undefined)?.includes(
                "header:List-Unsubscribe:asText",
              )
            ) {
              throw new SafeError(
                "JMAP error: invalidArguments - List-Unsubscribe cannot use asText",
              );
            }
            result = {
              state: "s1",
              list: ((args.ids as string[] | undefined) ?? ["message"]).map(
                (messageId) => ({
                  id: messageId,
                  threadId: "thread",
                  mailboxIds: { [options.draft ? "drafts" : "inbox"]: true },
                  keywords: options.draft ? { $draft: true } : {},
                  receivedAt: "2026-10-01T12:00:00Z",
                  from: [{ email: "owner@example.com" }],
                  to: [{ email: "to@example.com" }],
                  subject: "Hello",
                  "header:List-Unsubscribe":
                    "<https://example.com/unsubscribe>, <mailto:unsubscribe@example.com>",
                  attachments:
                    options.forwardedAttachments && messageId === "original"
                      ? [
                          {
                            blobId: "original-file",
                            name: "report.pdf",
                            type: "application/pdf",
                            size: 15,
                          },
                          {
                            blobId: "original-inline",
                            name: "chart.png",
                            type: "image/png",
                            size: 12,
                            cid: "chart",
                          },
                        ]
                      : [],
                }),
              ),
            };
            break;
          case "Email/set":
            result = args.create
              ? { created: { email: { id: "created", threadId: "thread" } } }
              : args.destroy
                ? { destroyed: args.destroy }
                : {
                    updated: Object.fromEntries(
                      Object.keys(args.update as object).map((key) => [
                        key,
                        null,
                      ]),
                    ),
                  };
            break;
          case "EmailSubmission/set":
            if (options.submissionError) throw options.submissionError;
            result = options.submissionRejected
              ? {
                  notCreated: {
                    submission: {
                      type: "forbidden",
                      description: "Sending denied",
                    },
                  },
                }
              : { created: { submission: { id: "submission" } } };
            break;
          default:
            throw new Error(`Unexpected JMAP method: ${name}`);
        }
        return [name, result, id];
      }),
    };
  });
  const client = {
    accountId: "account",
    request,
    session: {
      uploadUrl: "https://api.fastmail.com/upload/{accountId}",
      downloadUrl:
        "https://api.fastmail.com/download/{accountId}/{blobId}/{name}?type={type}",
      capabilities: { "urn:ietf:params:jmap:core": { maxObjectsInSet: 2 } },
    },
  } as unknown as FastmailClient;
  return {
    provider: new FastmailProvider(
      client,
      createScopedLogger("fastmail-test"),
      options.emailAccountId,
    ),
    request,
    calls,
  };
}
