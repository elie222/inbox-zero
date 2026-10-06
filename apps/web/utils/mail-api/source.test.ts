import { describe, expect, it, vi } from "vitest";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
  InvalidMailboxSyncCursorError,
} from "@/utils/email/mailbox-sync";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { syncPageSchema } from "@inboxzero/mail-core/sync";
import { createEmailProviderMailboxSource } from "./source";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

describe("createEmailProviderMailboxSource", () => {
  it("continues provider search after the first page", async () => {
    const searchMessages = vi.fn(
      async ({ pageToken }: { pageToken?: string }) => ({
        messages: [searchMessage(pageToken ? "second" : "first")],
        nextPageToken: pageToken ? undefined : "next-page",
      }),
    );
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: { name: "google", searchMessages } as unknown as EmailProvider,
    });
    const input = {
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "search-1",
      signal: new AbortController().signal,
      predicate: {
        kind: "text",
        field: "any",
        value: "invoice",
        match: "phrase",
      } as const,
      pageSize: 20,
    };
    await expect(
      source.search({ ...input, page: null }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [{ messageId: "first" }], nextPage: "next-page" },
    });
    await expect(
      source.search({ ...input, page: "next-page" }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [{ messageId: "second" }], nextPage: null },
    });
    expect(searchMessages).toHaveBeenLastCalledWith({
      query: "",
      mailboxSearch: {
        mailbox: "all",
        text: { kind: "text", field: "any", value: "invoice", match: "phrase" },
      },
      maxResults: 20,
      pageToken: "next-page",
    });
  });

  it("caps Microsoft provider searches to Outlook list page size", async () => {
    const searchMessages = vi.fn(
      async ({ pageToken }: { pageToken?: string }) => ({
        messages: [searchMessage(pageToken ? "second" : "first")],
        nextPageToken: pageToken ? undefined : "next-page",
      }),
    );
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        searchMessages,
      } as unknown as EmailProvider,
    });
    await source.search({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "search-1",
      signal: new AbortController().signal,
      predicate: {
        kind: "text",
        field: "any",
        value: "invoice",
        match: "phrase",
      },
      page: null,
      pageSize: 50,
    });
    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      mailboxSearch: {
        mailbox: "all",
        text: { kind: "text", field: "any", value: "invoice", match: "phrase" },
      },
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("reports a search the provider rejects as unsupported so it is not retried", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        searchMessages: vi.fn(async () => {
          throw Object.assign(new Error("Syntax error in search query"), {
            statusCode: 400,
          });
        }),
      } as unknown as EmailProvider,
    });
    await expect(
      source.search(searchInput("acc-1", { value: "to:someone" })),
    ).resolves.toEqual({ status: "unsupported" });
  });

  it("pauses a search when the provider fails transiently", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        searchMessages: vi.fn(async () => {
          throw Object.assign(new Error("Backend error"), { status: 503 });
        }),
      } as unknown as EmailProvider,
    });
    await expect(
      source.search(searchInput("acc-1", { value: "invoice" })),
    ).resolves.toMatchObject({ status: "paused", reason: "unavailable" });
  });

  it("includes spam when the search predicate is scoped to that mailbox", async () => {
    const searchMessages = vi.fn(async () => ({
      messages: [searchMessage("spam-hit", ["SPAM"])],
      nextPageToken: undefined,
    }));
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: { name: "google", searchMessages } as unknown as EmailProvider,
    });
    await expect(
      source.search({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "search-spam",
        signal: new AbortController().signal,
        predicate: {
          kind: "all",
          predicates: [
            { kind: "text", field: "any", value: "invoice", match: "phrase" },
            { kind: "mailbox", mailbox: "spam" },
          ],
        },
        page: null,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [{ messageId: "spam-hit" }] },
    });
    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      mailboxSearch: {
        mailbox: "spam",
        text: { kind: "text", field: "any", value: "invoice", match: "phrase" },
      },
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("retries conversation membership when the provider is unavailable", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getThread() {
          throw new Error("503 Service unavailable");
        },
      } as unknown as EmailProvider,
    });
    await expect(
      source.readConversationMembership({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "membership-1",
        signal: new AbortController().signal,
        conversation: { accountId: "acc-1", conversationId: "c-1" },
        resolutionId: "resolution-1",
        page: null,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ status: "paused", reason: "unavailable" });
  });

  it("requests a scoped rebuild when the provider cursor is expired", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new InvalidMailboxSyncCursorError();
        },
        async getMessagesWithPagination() {
          throw new InvalidMailboxSyncCursorError();
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "expired",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "reset_required",
      scopeId: "primary",
    });
  });

  it("treats an explicit reset page as expired history", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        async getMailboxSyncPage() {
          return {
            reset: true,
            cursor: "",
            upsertedMessages: [],
            deletedMessageIds: [],
            hasMore: false,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "inbox",
        generation: "g1",
        checkpoint: "delta",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "reset_required",
      scopeId: "inbox",
    });
  });

  it("pauses catch-up when the provider is throttled", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new ProviderRateLimitModeError({ provider: "google" });
        },
        async getMessagesWithPagination() {
          throw new ProviderRateLimitModeError({ provider: "google" });
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "1",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "paused",
      reason: "throttled",
    });
  });

  it("does not replace a failed delta cursor with a mailbox list page token", async () => {
    const getMessagesWithPagination = vi.fn();
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new Error("provider down");
        },
        getMessagesWithPagination,
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "history-cursor",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "paused",
      retryAfterMs: 1000,
      reason: "unavailable",
    });
    expect(getMessagesWithPagination).not.toHaveBeenCalled();
  });

  it("exposes Outlook folders as sync scopes, with custom folders at low priority", async () => {
    const getFolders = vi.fn().mockResolvedValue([
      {
        id: "inbox",
        displayName: "Inbox",
        systemType: "INBOX",
        childFolders: [{ id: "child", displayName: "Child", childFolders: [] }],
      },
      {
        id: "archive",
        displayName: "Archive",
        systemType: "ARCHIVE",
        childFolders: [],
      },
    ]);
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        getFolders,
      } as unknown as EmailProvider,
    });
    const result = await source.discoverScopes({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      page: null,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: "ok",
      value: {
        scopes: [
          { id: "inbox", kind: "folder", folderId: "inbox", priority: "high" },
          { id: "child", kind: "folder", folderId: "child", priority: "low" },
          {
            id: "archive",
            kind: "folder",
            folderId: "archive",
            priority: "high",
          },
        ],
        nextPage: null,
      },
    });
    expect(getFolders).toHaveBeenCalled();
  });

  it("enumerates an Outlook folder scope and starts catch-up from its folder cursor", async () => {
    const getMailboxSyncPage = vi.fn().mockResolvedValue({
      cursor: "folder-cursor",
      reset: true,
      upsertedMessages: [],
      deletedMessageIds: [],
      hasMore: false,
    });
    const getMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        getMailboxSyncPage,
        getMessagesWithPagination,
      } as unknown as EmailProvider,
    });
    const bootstrap = await source.beginBootstrap({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r-bootstrap",
      signal: new AbortController().signal,
      scope: { id: "archive", kind: "folder", folderId: "archive" },
      afterMs: 0,
    });
    expect(bootstrap.status).toBe("ok");
    if (bootstrap.status !== "ok") throw new Error("expected ok");
    expect(bootstrap.value.catchUpFrom).toEqual({
      streamId: "archive",
      generation: "g1",
      checkpoint: "folder-cursor",
    });
    const result = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: bootstrap.value.bootstrapId,
      page: bootstrap.value.enumerationToken,
      pageSize: 25,
    });
    expect(result).toMatchObject({
      status: "ok",
      value: {
        scopeId: "archive",
        catchUpFrom: {
          streamId: "archive",
          checkpoint: "folder-cursor",
        },
      },
    });
    expect(getMessagesWithPagination).toHaveBeenCalledWith({
      maxResults: 20,
      folderId: "archive",
      pageToken: undefined,
      includeDrafts: true,
    });
    expect(getMailboxSyncPage).toHaveBeenCalledWith({
      after: new Date(0),
      folderId: "archive",
      limit: 1,
    });
  });

  it("keeps the bootstrap catch-up cursor across paged enumeration", async () => {
    const getMailboxSyncPage = vi.fn().mockResolvedValueOnce({
      cursor: "before-enumeration-cursor",
      reset: true,
      upsertedMessages: [],
      deletedMessageIds: [],
      hasMore: true,
    });
    const getMessagesWithPagination = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        messages: [],
      });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        getMailboxSyncPage,
        getMessagesWithPagination,
      } as unknown as EmailProvider,
    });
    const bootstrap = await source.beginBootstrap({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r-bootstrap",
      signal: new AbortController().signal,
      scope: { id: "archive", kind: "folder", folderId: "archive" },
      afterMs: 0,
    });
    expect(bootstrap.status).toBe("ok");
    if (bootstrap.status !== "ok") throw new Error("expected ok");

    const firstPage = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: bootstrap.value.bootstrapId,
      page: bootstrap.value.enumerationToken,
      pageSize: 25,
    });
    expect(firstPage.status).toBe("ok");
    if (firstPage.status !== "ok") throw new Error("expected ok");
    expect(firstPage.value.nextPage).toBeTruthy();
    if (!firstPage.value.nextPage) throw new Error("expected next page");

    const finalPage = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r2",
      signal: new AbortController().signal,
      bootstrapId: bootstrap.value.bootstrapId,
      page: firstPage.value.nextPage,
      pageSize: 25,
    });

    expect(finalPage).toMatchObject({
      status: "ok",
      value: {
        nextPage: null,
        catchUpFrom: {
          streamId: "archive",
          generation: "g1",
          checkpoint: "before-enumeration-cursor",
        },
      },
    });
    expect(getMailboxSyncPage).toHaveBeenCalledTimes(1);
  });

  it("maps folder delta removals to removed-from-scope changes", async () => {
    const deltaCursor = `folder-cursor-${"x".repeat(2000)}`;
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        async getMailboxSyncPage() {
          return {
            cursor: deltaCursor,
            reset: false,
            upsertedMessages: [],
            deletedMessageIds: ["deleted-1"],
            removedMessageIds: ["moved-1"],
            hasMore: false,
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "archive",
        generation: "g1",
        checkpoint: "folder-cursor",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: "page",
      page: {
        changes: [
          {
            kind: "message_deleted",
            key: { accountId: "acc-1", messageId: "deleted-1" },
          },
          {
            kind: "removed_from_scope",
            key: { accountId: "acc-1", messageId: "moved-1" },
            scopeId: "archive",
          },
        ],
      },
    });
    if (result.status !== "page") throw new Error("expected a page");
    expect(() => syncPageSchema.parse(result.page)).not.toThrow();
  });

  it("batches folder reads, warming the provider with the first and capping concurrency", async () => {
    const folders = ["inbox", "a", "b", "c", "d", "e"];
    let inFlight = 0;
    let maxInFlight = 0;
    const started: string[] = [];
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        async getMailboxSyncPage({ folderId }: { folderId: string }) {
          started.push(`${folderId}:${inFlight}`);
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return {
            cursor: `${folderId}-next`,
            reset: false,
            upsertedMessages: [],
            deletedMessageIds: [],
            removedMessageIds: [],
            hasMore: false,
          };
        },
      } as unknown as EmailProvider,
    });

    const results = await source.readChangesBatch({
      session: { accountId: "acc-1", generation: "g1" },
      reads: folders.map((streamId, index) => ({
        requestId: `r${index}`,
        position: { streamId, generation: "g1", checkpoint: "cursor" },
      })),
      pageSize: 20,
      signal: new AbortController().signal,
    });

    expect(started[0]).toBe("inbox:0");
    expect(started[1]).toBe("a:0");
    expect(maxInFlight).toBe(3);
    expect(
      results.map(
        (result) => result.status === "page" && result.page.to.checkpoint,
      ),
    ).toEqual(folders.map((folder) => `${folder}-next`));
  });

  it("pages conversation membership instead of truncating the thread", async () => {
    const messages = Array.from({ length: 3 }, (_, index) => ({
      id: `m${index + 1}`,
      threadId: "c1",
      headers: { from: "ada@example.com" },
      labelIds: ["INBOX"],
      snippet: `m${index + 1}`,
    }));
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getThread() {
          return { messages, historyId: "h1" };
        },
      } as unknown as EmailProvider,
    });
    const first = await source.readConversationMembership({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      conversation: { accountId: "acc-1", conversationId: "c1" },
      resolutionId: "res",
      page: null,
      pageSize: 2,
    });
    expect(first).toMatchObject({
      status: "ok",
      value: {
        status: "page",
        page: {
          nextPage: "2",
          keys: [
            { accountId: "acc-1", messageId: "m1" },
            { accountId: "acc-1", messageId: "m2" },
          ],
        },
      },
    });
    const second = await source.readConversationMembership({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r2",
      signal: new AbortController().signal,
      conversation: { accountId: "acc-1", conversationId: "c1" },
      resolutionId: "res",
      page: "2",
      pageSize: 2,
    });
    expect(second).toMatchObject({
      status: "ok",
      value: {
        status: "page",
        page: {
          nextPage: null,
          keys: [{ accountId: "acc-1", messageId: "m3" }],
        },
      },
    });
  });

  it("enumerates mailbox pages including drafts", async () => {
    const getMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        getMessagesWithPagination,
        async getMailboxSyncPage() {
          return {
            cursor: "gmail-cursor",
            reset: true,
            upsertedMessages: [],
            deletedMessageIds: [],
            hasMore: false,
          };
        },
      } as unknown as EmailProvider,
    });
    await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(getMessagesWithPagination).toHaveBeenCalledWith({
      maxResults: 50,
      pageToken: undefined,
      includeDrafts: true,
    });
  });

  it("advertises and uses the Outlook list page size for Microsoft enumeration", async () => {
    const getMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "microsoft",
        localMailSyncStrategy: "folder-delta",
        getMessagesWithPagination,
      } as unknown as EmailProvider,
    });
    await expect(
      source.describe({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "describe-1",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { maxPageSize: 20 },
    });
    await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: JSON.stringify({ folderId: "inbox", scopeId: "inbox" }),
      pageSize: 50,
    });
    expect(getMessagesWithPagination).toHaveBeenCalledWith({
      maxResults: 20,
      folderId: "inbox",
      pageToken: undefined,
      includeDrafts: true,
    });
  });

  it("stores a provider history cursor when enumeration finishes", async () => {
    const cursor = encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "42",
      after: "1970-01-01T00:00:00.000Z",
    });
    const getMailboxSyncPage = vi.fn().mockResolvedValue({
      cursor,
      reset: true,
      upsertedMessages: [],
      deletedMessageIds: [],
      hasMore: false,
    });
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        getMailboxSyncPage,
        async getMessagesWithPagination() {
          return {
            messages: [
              {
                id: "m1",
                threadId: "t1",
                historyId: "9",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "Hi",
              },
            ],
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(result).toMatchObject({
      status: "ok",
      value: {
        nextPage: null,
        catchUpFrom: {
          streamId: "primary",
          generation: "g1",
          checkpoint: cursor,
        },
      },
    });
    expect(getMailboxSyncPage).toHaveBeenCalledWith({
      after: new Date(0),
      limit: 1,
    });
  });

  it("encodes the newest Gmail history id when the provider cursor is unavailable", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMailboxSyncPage() {
          throw new Error("profile unavailable");
        },
        async getMessagesWithPagination() {
          return {
            messages: [
              {
                id: "old",
                threadId: "t1",
                historyId: "10",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "Old",
              },
              {
                id: "new",
                threadId: "t2",
                historyId: "99",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "New",
              },
            ],
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.value.nextPage).toBeNull();
    if (result.value.nextPage !== null) throw new Error("expected last page");
    expect(
      decodeMailboxSyncCursor(
        result.value.catchUpFrom.checkpoint ?? "",
        "google",
      ),
    ).toMatchObject({
      historyId: "99",
      phase: "delta",
      provider: "google",
    });
  });

  it("returns enumerated bodies when the provider already fetched them", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessagesWithPagination() {
          return {
            messages: [
              {
                id: "draft-1",
                threadId: "t1",
                historyId: "9",
                headers: { from: "me@example.com" },
                labelIds: ["DRAFT"],
                snippet: "First",
                textPlain: "First saved reply",
                textHtml: "<p>First saved reply</p>",
                attachments: [
                  {
                    attachmentId: "att-1",
                    filename: "reader-preview.png",
                    mimeType: "image/png",
                    size: 12,
                    headers: {
                      "content-description": "",
                      "content-id": "",
                      "content-transfer-encoding": "base64",
                      "content-type": "image/png",
                    },
                  },
                ],
                isMeetingInvitation: true,
                inline: [],
              },
              {
                id: "empty-1",
                threadId: "t2",
                historyId: "10",
                headers: { from: "ada@example.com" },
                labelIds: ["INBOX"],
                snippet: "Hi",
              },
            ],
          };
        },
        async getMailboxSyncPage() {
          throw new Error("unused");
        },
      } as unknown as EmailProvider,
    });
    const result = await source.enumerate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      bootstrapId: "mailbox",
      page: "{}",
      pageSize: 50,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.value.bodies).toEqual([
      {
        key: { accountId: "acc-1", messageId: "draft-1" },
        version: "9",
        html: "<p>First saved reply</p>",
        text: "First saved reply",
        attachments: [
          {
            attachmentId: "att-1",
            filename: "reader-preview.png",
            mimeType: "image/png",
            size: 12,
            inline: false,
            contentId: null,
          },
        ],
        isMeetingInvitation: true,
      },
    ]);
    expect(result.value.requiredHydration).toEqual([
      { accountId: "acc-1", messageId: "empty-1" },
    ]);
  });

  it("hydrates attachment descriptors and meeting invitations with the body", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessage() {
          return {
            id: "msg-1",
            threadId: "t1",
            historyId: "11",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: "Invite",
            textPlain: "Please join",
            attachments: [
              {
                attachmentId: "att-ics",
                filename: "invite.ics",
                mimeType: "text/calendar",
                size: 80,
                headers: {
                  "content-description": "",
                  "content-id": "",
                  "content-transfer-encoding": "base64",
                  "content-type": "text/calendar",
                },
              },
            ],
            isMeetingInvitation: true,
            inline: [],
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.hydrate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      keys: [{ accountId: "acc-1", messageId: "msg-1" }],
      purpose: "body",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.value.bodies).toEqual([
      {
        key: { accountId: "acc-1", messageId: "msg-1" },
        version: "11",
        html: null,
        text: "Please join",
        attachments: [
          {
            attachmentId: "att-ics",
            filename: "invite.ics",
            mimeType: "text/calendar",
            size: 80,
            inline: false,
            contentId: null,
          },
        ],
        isMeetingInvitation: true,
      },
    ]);
  });

  it.each([
    [401, "blocked_auth"],
    [503, "paused"],
    [404, "ok"],
  ])("preserves hydration failures (%s)", async (status, expected) => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessage() {
          throw Object.assign(new Error(`Provider returned ${status}`), {
            status,
          });
        },
      } as unknown as EmailProvider,
    });
    const result = await source.hydrate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      keys: [{ accountId: "acc-1", messageId: "m1" }],
      purpose: "body",
    });
    expect(result.status).toBe(expected);
    if (result.status === "ok") {
      expect(result.value.unresolved).toEqual([
        { key: { accountId: "acc-1", messageId: "m1" }, reason: "not_found" },
      ]);
    }
  });

  it("emits an empty body observation when hydrate finds no text", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        async getMessage() {
          return {
            id: "empty-1",
            threadId: "t2",
            historyId: "10",
            headers: { from: "ada@example.com" },
            labelIds: ["INBOX"],
            snippet: "Hi",
            inline: [],
          };
        },
      } as unknown as EmailProvider,
    });
    const result = await source.hydrate({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      keys: [{ accountId: "acc-1", messageId: "empty-1" }],
      purpose: "body",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.value.bodies).toEqual([
      {
        key: { accountId: "acc-1", messageId: "empty-1" },
        version: "10",
        html: null,
        text: null,
        attachments: [],
        isMeetingInvitation: false,
      },
    ]);
  });

  it("blocks catch-up when provider authentication fails", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage() {
          throw new Error("401 unauthorized");
        },
        async getMessagesWithPagination() {
          throw new Error("401 unauthorized");
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readChanges({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      position: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "1",
      },
      pageSize: 20,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ status: "blocked_auth" });
  });

  it("streams attachment bytes from the provider", async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getAttachmentStream(messageId, attachmentId, signal) {
          expect(messageId).toBe("m1");
          expect(attachmentId).toBe("att-1");
          expect(signal).toBeDefined();
          return new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          });
        },
      } as unknown as EmailProvider,
    });
    const result = await source.readAttachment({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "r1",
      signal: new AbortController().signal,
      key: { accountId: "acc-1", messageId: "m1" },
      attachmentId: "att-1",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.value.bytes) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
  });

  it("pauses attachment reads when the provider is unavailable", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getAttachmentStream() {
          throw new Error("provider down");
        },
      } as unknown as EmailProvider,
    });
    await expect(
      source.readAttachment({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "r1",
        signal: new AbortController().signal,
        key: { accountId: "acc-1", messageId: "m1" },
        attachmentId: "att-1",
      }),
    ).resolves.toEqual({
      status: "paused",
      retryAfterMs: 1000,
      reason: "unavailable",
    });
  });

  it("does not retry a missing provider attachment", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getAttachmentStream() {
          throw Object.assign(new Error("Unable to stream attachment"), {
            status: 404,
          });
        },
      } as unknown as EmailProvider,
    });
    await expect(
      source.readAttachment({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "r1",
        signal: new AbortController().signal,
        key: { accountId: "acc-1", messageId: "missing" },
        attachmentId: "att-1",
      }),
    ).resolves.toEqual({
      status: "not_found",
    });
  });
});

function searchInput(accountId: string, text: { value: string }) {
  return {
    session: { accountId, generation: "g1" },
    requestId: "search-1",
    signal: new AbortController().signal,
    predicate: {
      kind: "text",
      field: "any",
      value: text.value,
      match: "phrase",
    } as const,
    page: null,
    pageSize: 20,
  };
}

function searchMessage(id: string, labelIds: string[] = []) {
  return {
    id,
    threadId: id,
    headers: { from: "sender@example.com", to: "user@example.com" },
    subject: "invoice",
    snippet: "invoice",
    labelIds,
    internalDate: "1767225600000",
  };
}

describe("structured mailbox search", () => {
  it.each([
    "google",
    "microsoft",
  ])("rechecks %s text candidates using a single canonical field", async (name) => {
    const messages = [
      {
        ...searchMessage("split-fields"),
        subject: "alpha",
        snippet: "beta",
        textPlain: "",
      },
      {
        ...searchMessage("subject-match"),
        subject: "alpha beta",
        snippet: "",
        textPlain: "",
      },
      {
        ...searchMessage("body-match"),
        subject: "Elsewhere",
        snippet: "",
        textPlain: "alpha beta",
      },
      {
        ...searchMessage("html-match"),
        subject: "Elsewhere",
        snippet: "",
        textHtml: "<p>alpha <strong>beta</strong></p>",
      },
    ];
    const getMessage = vi.fn();
    const source = createEmailProviderMailboxSource({
      accountId: "a",
      provider: {
        name,
        searchMessages: async () => ({ messages }),
        getMessage,
      } as unknown as EmailProvider,
    });
    await expect(
      source.search({
        session: { accountId: "a", generation: "1" },
        requestId: "search",
        signal: new AbortController().signal,
        page: null,
        pageSize: 20,
        predicate: {
          kind: "text",
          field: "any",
          value: "alpha beta",
          match: "term",
        },
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: {
        matches: [
          { messageId: "subject-match" },
          { messageId: "body-match" },
          { messageId: "html-match" },
        ],
      },
    });
    expect(getMessage).not.toHaveBeenCalled();
  });

  it("rejects metadata exclusions before loading omitted candidate bodies", async () => {
    const getMessage = vi.fn();
    const source = createEmailProviderMailboxSource({
      accountId: "a",
      provider: {
        name: "microsoft",
        getMessage,
        searchMessages: async () => ({
          messages: [
            { ...searchMessage("already-read"), subject: "", snippet: "" },
            {
              ...searchMessage("spam", ["SPAM", "UNREAD"]),
              subject: "",
              snippet: "",
            },
            {
              ...searchMessage("sent", ["SENT", "UNREAD"]),
              subject: "",
              snippet: "",
            },
          ],
        }),
      } as unknown as EmailProvider,
    });
    await expect(
      source.search({
        session: { accountId: "a", generation: "1" },
        requestId: "search",
        signal: new AbortController().signal,
        page: null,
        pageSize: 20,
        predicate: {
          kind: "all",
          predicates: [
            { kind: "text", field: "any", value: "alpha beta", match: "term" },
            { kind: "read", value: false },
            { kind: "not", predicate: { kind: "role", role: "sent" } },
          ],
        },
      }),
    ).resolves.toMatchObject({ status: "ok", value: { matches: [] } });
    expect(getMessage).not.toHaveBeenCalled();
  });

  it("loads a missing body projection before rejecting an any-field match and keeps pagination", async () => {
    const getMessage = vi.fn(async () => ({
      ...searchMessage("body-hit"),
      textPlain: "alpha beta",
    }));
    const source = createEmailProviderMailboxSource({
      accountId: "a",
      provider: {
        name: "microsoft",
        getMessage,
        searchMessages: async () => ({
          messages: [
            { ...searchMessage("body-hit"), subject: "alpha", snippet: "beta" },
          ],
          nextPageToken: "next",
        }),
      } as unknown as EmailProvider,
    });
    await expect(
      source.search({
        session: { accountId: "a", generation: "1" },
        requestId: "search",
        signal: new AbortController().signal,
        page: null,
        pageSize: 20,
        predicate: {
          kind: "text",
          field: "any",
          value: "alpha beta",
          match: "term",
        },
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [{ messageId: "body-hit" }], nextPage: "next" },
    });
    expect(getMessage).toHaveBeenCalledWith("body-hit");
  });

  it("does not hide a missing body when provider hydration fails", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "a",
      provider: {
        name: "microsoft",
        getMessage: vi
          .fn()
          .mockRejectedValue(new Error("body download failed")),
        searchMessages: async () => ({
          messages: [
            { ...searchMessage("body-hit"), subject: "alpha", snippet: "beta" },
          ],
        }),
      } as unknown as EmailProvider,
    });
    await expect(
      source.search({
        session: { accountId: "a", generation: "1" },
        requestId: "search",
        signal: new AbortController().signal,
        page: null,
        pageSize: 20,
        predicate: {
          kind: "text",
          field: "any",
          value: "alpha beta",
          match: "term",
        },
      }),
    ).rejects.toThrow("body download failed");
  });

  it("filters all chips on the same message and preserves an empty-page continuation", async () => {
    const searchMessages = vi.fn(
      async ({ pageToken }: { pageToken?: string }) => ({
        messages: [
          pageToken
            ? {
                ...searchMessage("match", ["UNREAD", "STARRED"]),
                hasAttachment: true,
              }
            : { ...searchMessage("wrong", ["UNREAD"]), hasAttachment: true },
        ],
        nextPageToken: pageToken ? undefined : "second",
      }),
    );
    const source = createEmailProviderMailboxSource({
      accountId: "a",
      provider: {
        name: "microsoft",
        searchMessages,
      } as unknown as EmailProvider,
    });
    const input = {
      session: { accountId: "a", generation: "1" },
      requestId: "search",
      signal: new AbortController().signal,
      pageSize: 20,
      predicate: {
        kind: "all",
        predicates: [
          { kind: "read", value: false },
          { kind: "starred", value: true },
          { kind: "has_attachment", value: true },
        ],
      } as const,
    };
    await expect(
      source.search({
        ...input,
        predicate: { kind: "all", predicates: [...input.predicate.predicates] },
        page: null,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [], nextPage: "second" },
    });
    await expect(
      source.search({
        ...input,
        predicate: { kind: "all", predicates: [...input.predicate.predicates] },
        page: "second",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [{ messageId: "match" }], nextPage: null },
    });
  });

  it("keeps canonical archive scope and permits explicit sent/draft exclusions", async () => {
    const source = createEmailProviderMailboxSource({
      accountId: "a",
      provider: {
        name: "microsoft",
        searchMessages: async () => ({
          messages: [
            searchMessage("custom"),
            searchMessage("sent", ["SENT"]),
            searchMessage("draft", ["DRAFT"]),
            searchMessage("inbox", ["INBOX"]),
            searchMessage("spam", ["SPAM"]),
            searchMessage("trash", ["TRASH"]),
          ],
        }),
      } as unknown as EmailProvider,
    });
    const input = {
      session: { accountId: "a", generation: "1" },
      requestId: "search",
      signal: new AbortController().signal,
      pageSize: 20,
      page: null,
    };
    await expect(
      source.search({
        ...input,
        predicate: { kind: "mailbox", mailbox: "archive" },
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: {
        matches: [
          { messageId: "custom" },
          { messageId: "sent" },
          { messageId: "draft" },
        ],
      },
    });
    await expect(
      source.search({
        ...input,
        predicate: {
          kind: "all",
          predicates: [
            { kind: "mailbox", mailbox: "archive" },
            { kind: "not", predicate: { kind: "role", role: "sent" } },
            { kind: "not", predicate: { kind: "role", role: "draft" } },
          ],
        },
      }),
    ).resolves.toMatchObject({
      status: "ok",
      value: { matches: [{ messageId: "custom" }] },
    });
  });
});
