import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SYNC_PAGE_CHANGES,
  type ProviderChange,
  syncPageSchema,
} from "@inboxzero/mail-core/sync";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
import type { EmailProvider } from "@/utils/email/types";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";
import { getHistory } from "@/utils/gmail/history";
import {
  getGmailMailboxChangeIds,
  getGmailMailboxSyncPage,
} from "@/utils/gmail/mailbox-sync";
import {
  getMessage,
  getMessagesBatch,
  parseMessage,
} from "@/utils/gmail/message";

vi.mock("@/utils/gmail/history");
vi.mock("@/utils/gmail/message");

const logger = createTestLogger();
const after = "2026-07-01T00:00:00.000Z";
const recentInternalDate = new Date("2026-07-02T00:00:00.000Z")
  .getTime()
  .toString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMessage).mockRejectedValue({ status: 404 });
});

describe("getGmailMailboxSyncPage", () => {
  it.each([
    "snapshot",
    "delta",
  ] as const)("does not advance %s sync when an omitted message is inaccessible", async (phase) => {
    const failure = { status: 403, message: "Permission denied" };
    vi.mocked(getMessage).mockRejectedValue(failure);
    vi.mocked(getMessagesBatch).mockResolvedValue([]);
    vi.mocked(getHistory).mockResolvedValue({
      history: [{ messagesAdded: [{ message: { id: "omitted" } }] }],
      historyId: "200",
    });
    const gmail = {
      users: {
        getProfile: vi.fn().mockResolvedValue({ data: { historyId: "100" } }),
        messages: {
          list: vi.fn().mockResolvedValue({
            data: { messages: [{ id: "omitted" }], nextPageToken: "next" },
          }),
        },
      },
    };

    await expect(
      getGmailMailboxSyncPage({
        gmail: gmail as never,
        accessToken: "access-token",
        logger,
        after: new Date("2026-07-01T00:00:00.000Z"),
        cursor:
          phase === "delta"
            ? encodeMailboxSyncCursor({
                version: 1,
                provider: "google",
                phase: "delta",
                historyId: "100",
                after: "2026-07-01T00:00:00.000Z",
              })
            : undefined,
        limit: 100,
      }),
    ).rejects.toEqual(failure);
  });

  it("continues a snapshot when an omitted message is confirmed deleted", async () => {
    vi.mocked(getMessagesBatch).mockResolvedValue([]);
    const gmail = {
      users: {
        getProfile: vi.fn().mockResolvedValue({ data: { historyId: "100" } }),
        messages: {
          list: vi.fn().mockResolvedValue({
            data: { messages: [{ id: "deleted" }], nextPageToken: "next" },
          }),
        },
      },
    };

    const page = await getGmailMailboxSyncPage({
      gmail: gmail as never,
      accessToken: "access-token",
      logger,
      after: new Date("2026-07-01T00:00:00.000Z"),
      limit: 100,
    });

    expect(getMessage).toHaveBeenCalledWith("deleted", gmail, "full");
    expect(page.upsertedMessages).toEqual([]);
    expect(page.hasMore).toBe(true);
  });

  it("recovers an omitted message instead of treating it as deleted", async () => {
    vi.mocked(getMessagesBatch).mockResolvedValue([]);
    vi.mocked(getHistory).mockResolvedValue({
      history: [{ messagesAdded: [{ message: { id: "omitted" } }] }],
      historyId: "200",
    });
    const message = {
      ...getMockMessage({ id: "omitted" }),
      internalDate: String(new Date("2026-07-02T00:00:00.000Z").getTime()),
    };
    vi.mocked(getMessage).mockResolvedValue({ id: "omitted" } as never);
    vi.mocked(parseMessage).mockReturnValue(message as never);

    const page = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "100",
        after: "2026-07-01T00:00:00.000Z",
      }),
      limit: 100,
    });

    expect(page.upsertedMessages.map((item) => item.id)).toEqual(["omitted"]);
    expect(page.deletedMessageIds).toEqual([]);
  });

  it("keeps recent messages including archived mail and removes ones outside the time window", async () => {
    const recentInternalDate = new Date("2026-07-02T00:00:00.000Z")
      .getTime()
      .toString();
    const oldInternalDate = new Date("2025-06-30T00:00:00.000Z")
      .getTime()
      .toString();

    vi.mocked(getHistory).mockResolvedValue({
      history: [
        {
          messagesAdded: [
            { message: { id: "inbox-message" } },
            { message: { id: "unavailable-label-message" } },
            { message: { id: "archived-message", threadId: "changed-thread" } },
            { message: { id: "old-message" } },
            { message: { id: "missing-message" } },
          ],
          messagesDeleted: [{ message: { id: "deleted-message" } }],
        },
      ],
      historyId: "200",
    });
    vi.mocked(getMessagesBatch).mockResolvedValue([
      {
        ...getMockMessage({
          id: "inbox-message",
          labelIds: ["INBOX"],
        }),
        internalDate: recentInternalDate,
      },
      {
        ...getMockMessage({ id: "unavailable-label-message" }),
        internalDate: recentInternalDate,
        labelIds: undefined,
      },
      {
        ...getMockMessage({
          id: "archived-message",
          labelIds: [],
        }),
        internalDate: recentInternalDate,
      },
      {
        ...getMockMessage({
          id: "old-message",
          labelIds: ["INBOX"],
        }),
        internalDate: oldInternalDate,
      },
    ]);

    const page = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "100",
        after: "2026-07-01T00:00:00.000Z",
      }),
      limit: 100,
    });

    expect(getHistory).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        historyTypes: [
          "messageAdded",
          "messageDeleted",
          "labelAdded",
          "labelRemoved",
        ],
        startHistoryId: "100",
      }),
      logger,
    );
    expect(page.upsertedMessages.map((message) => message.id)).toEqual([
      "inbox-message",
      "unavailable-label-message",
      "archived-message",
    ]);
    expect(page.changedThreadIds).toEqual(["changed-thread"]);
    expect(page.deletedMessageIds).toEqual([
      "deleted-message",
      "old-message",
      "missing-message",
    ]);
  });

  it("rebuilds from snapshot when Gmail history returns 404", async () => {
    vi.mocked(getHistory).mockRejectedValue({ status: 404 });
    vi.mocked(getMessagesBatch).mockResolvedValue([
      {
        ...getMockMessage({
          id: "inbox-message",
          labelIds: ["INBOX"],
        }),
        internalDate: new Date("2026-07-02T00:00:00.000Z").getTime().toString(),
      },
    ]);
    const gmail = {
      users: {
        getProfile: vi.fn().mockResolvedValue({ data: { historyId: "300" } }),
        messages: {
          list: vi.fn().mockResolvedValue({
            data: { messages: [{ id: "inbox-message" }] },
          }),
        },
      },
    };

    const page = await getGmailMailboxSyncPage({
      gmail: gmail as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "1",
        after: "2026-07-01T00:00:00.000Z",
      }),
      limit: 100,
    });

    expect(page.reset).toBe(true);
    expect(page.upsertedMessages.map((message) => message.id)).toEqual([
      "inbox-message",
    ]);
    expect(gmail.users.getProfile).toHaveBeenCalled();
  });

  it("writes current labels for an archived message instead of deleting it", async () => {
    vi.mocked(getHistory).mockResolvedValue({
      history: [
        {
          labelsRemoved: [
            {
              labelIds: ["INBOX"],
              message: { id: "archived-message", threadId: "alert-thread" },
            },
          ],
        },
      ],
      historyId: "200",
    });
    vi.mocked(getMessagesBatch).mockResolvedValue([
      {
        ...getMockMessage({
          id: "archived-message",
          labelIds: ["UNREAD"],
        }),
        internalDate: new Date("2026-07-02T00:00:00.000Z").getTime().toString(),
      },
    ]);

    const page = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "100",
        after: "2026-07-01T00:00:00.000Z",
      }),
      limit: 100,
    });

    expect(page.upsertedMessages.map((message) => message.id)).toEqual([
      "archived-message",
    ]);
    expect(page.upsertedMessages[0]?.labelIds).toEqual(["UNREAD"]);
    expect(page.deletedMessageIds).toEqual([]);
    expect(page.changedThreadIds).toEqual(["alert-thread"]);
  });

  it("bounds an expanded history page while keeping every change before advancing", async () => {
    const addedIds = Array.from(
      { length: 700 },
      (_, index) => `added-${index}`,
    );
    const deletedIds = Array.from(
      { length: 700 },
      (_, index) => `deleted-${index}`,
    );
    vi.mocked(getHistory).mockResolvedValue({
      history: [historyRecord({ added: addedIds, deleted: deletedIds })],
      historyId: "200",
    });
    stubFetchedMessages();

    const first = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: deltaCursor(),
      limit: 100,
    });

    expect(first.upsertedMessages.map((message) => message.id)).toEqual(
      addedIds,
    );
    expect(first.deletedMessageIds).toEqual(deletedIds.slice(0, 300));
    expect(first.hasMore).toBe(true);
    expect(decodeMailboxSyncCursor(first.cursor, "google")).toMatchObject({
      historyId: "100",
      changeOffset: MAX_SYNC_PAGE_CHANGES,
      endHistoryId: "200",
    });

    const second = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: first.cursor,
      limit: 100,
    });

    expect(second.upsertedMessages).toEqual([]);
    expect(second.deletedMessageIds).toEqual(deletedIds.slice(300));
    expect(second.hasMore).toBe(false);
    const secondCursor = decodeMailboxSyncCursor(second.cursor, "google");
    expect(secondCursor.historyId).toBe("200");
    expect(secondCursor.changeOffset).toBeUndefined();
    expect(secondCursor.endHistoryId).toBeUndefined();
  });

  it("ignores history records newer than the saved end history when resuming", async () => {
    const addedIds = Array.from(
      { length: 700 },
      (_, index) => `added-${index}`,
    );
    const deletedIds = Array.from(
      { length: 700 },
      (_, index) => `deleted-${index}`,
    );
    const original = historyRecord({
      id: "150",
      added: addedIds,
      deleted: deletedIds,
    });
    const newer = historyRecord({ id: "201", deleted: [addedIds[0]] });
    vi.mocked(getHistory)
      .mockResolvedValueOnce({ history: [original], historyId: "200" })
      .mockResolvedValueOnce({
        history: [original, newer],
        historyId: "201",
      });
    stubFetchedMessages();

    const first = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: deltaCursor(),
      limit: 100,
    });
    expect(first.deletedMessageIds).toEqual(deletedIds.slice(0, 300));
    expect(first.hasMore).toBe(true);

    const second = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: first.cursor,
      limit: 100,
    });

    expect(second.upsertedMessages).toEqual([]);
    expect(second.deletedMessageIds).toEqual(deletedIds.slice(300));
    expect(second.hasMore).toBe(false);
    const secondCursor = decodeMailboxSyncCursor(second.cursor, "google");
    expect(secondCursor.historyId).toBe("200");
  });

  it("repeats a partial page for a retried cursor without overlapping later pages", async () => {
    const addedIds = Array.from(
      { length: 1100 },
      (_, index) => `retry-${index}`,
    );
    vi.mocked(getHistory).mockResolvedValue({
      history: [historyRecord({ added: addedIds })],
      historyId: "200",
    });
    stubFetchedMessages();

    const first = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: deltaCursor(),
      limit: 100,
    });
    const retry = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: deltaCursor(),
      limit: 100,
    });
    const second = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: first.cursor,
      limit: 100,
    });

    expect(retry.upsertedMessages).toEqual(first.upsertedMessages);
    expect(second.upsertedMessages.map((message) => message.id)).toEqual(
      addedIds.slice(MAX_SYNC_PAGE_CHANGES),
    );
    const firstIds = new Set(
      first.upsertedMessages.map((message) => message.id),
    );
    expect(
      second.upsertedMessages.every((message) => !firstIds.has(message.id)),
    ).toBe(true);
  });

  it("re-reads a history page that shrank below the saved offset", async () => {
    const addedIds = Array.from(
      { length: 700 },
      (_, index) => `shrunk-${index}`,
    );
    vi.mocked(getHistory).mockResolvedValue({
      history: [historyRecord({ added: addedIds })],
      historyId: "200",
    });
    stubFetchedMessages();

    const page = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "100",
        after,
        changeOffset: 900,
        endHistoryId: "200",
      }),
      limit: 100,
    });

    expect(page.upsertedMessages.map((message) => message.id)).toEqual(
      addedIds,
    );
    expect(page.hasMore).toBe(false);
    expect(decodeMailboxSyncCursor(page.cursor, "google").historyId).toBe(
      "200",
    );
  });

  it("restarts a page that shrank to exactly the saved offset", async () => {
    const addedIds = Array.from(
      { length: 700 },
      (_, index) => `exact-shrink-${index}`,
    );
    vi.mocked(getHistory).mockResolvedValue({
      history: [historyRecord({ added: addedIds })],
      historyId: "200",
    });
    stubFetchedMessages();

    const page = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "100",
        after,
        changeOffset: addedIds.length,
        endHistoryId: "200",
        pageFingerprint: "different-page",
      }),
      limit: 100,
    });

    expect(page.upsertedMessages.map((message) => message.id)).toEqual(
      addedIds,
    );
    expect(page.hasMore).toBe(false);
    expect(decodeMailboxSyncCursor(page.cursor, "google").historyId).toBe(
      "200",
    );
  });

  it("restarts a page whose contents changed before the saved offset", async () => {
    const addedIds = Array.from(
      { length: 1100 },
      (_, index) => `shifted-${index}`,
    );
    vi.mocked(getHistory).mockResolvedValue({
      history: [historyRecord({ added: addedIds })],
      historyId: "200",
    });
    stubFetchedMessages();

    const first = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: "100",
        after,
        changeOffset: MAX_SYNC_PAGE_CHANGES,
        endHistoryId: "200",
        pageFingerprint: "different-page",
      }),
      limit: 100,
    });

    expect(first.upsertedMessages.map((message) => message.id)).toEqual(
      addedIds.slice(0, MAX_SYNC_PAGE_CHANGES),
    );
    expect(first.hasMore).toBe(true);

    const second = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: first.cursor,
      limit: 100,
    });

    expect(second.upsertedMessages.map((message) => message.id)).toEqual(
      addedIds.slice(MAX_SYNC_PAGE_CHANGES),
    );
    expect(second.hasMore).toBe(false);
  });

  it("moves to the next Gmail history page only after the current page is drained", async () => {
    const addedIds = Array.from(
      { length: 1200 },
      (_, index) => `paged-${index}`,
    );
    vi.mocked(getHistory)
      .mockResolvedValueOnce({
        history: [historyRecord({ added: addedIds })],
        historyId: "200",
        nextPageToken: "next-page",
      })
      .mockResolvedValueOnce({
        history: [historyRecord({ added: addedIds })],
        historyId: "200",
        nextPageToken: "next-page",
      })
      .mockResolvedValueOnce({
        history: [historyRecord({ deleted: ["deleted-on-next-page"] })],
        historyId: "300",
      });
    stubFetchedMessages();

    const first = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: deltaCursor(),
      limit: 100,
    });
    const firstCursor = decodeMailboxSyncCursor(first.cursor, "google");
    expect(firstCursor).toMatchObject({
      historyId: "100",
      changeOffset: MAX_SYNC_PAGE_CHANGES,
    });
    expect(firstCursor.pageToken).toBeUndefined();

    const second = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: first.cursor,
      limit: 100,
    });
    const secondCursor = decodeMailboxSyncCursor(second.cursor, "google");
    expect(secondCursor).toMatchObject({
      historyId: "100",
      pageToken: "next-page",
    });
    expect(secondCursor.changeOffset).toBeUndefined();

    const third = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      cursor: second.cursor,
      limit: 100,
    });
    expect(getHistory).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        startHistoryId: "100",
        pageToken: "next-page",
      }),
      logger,
    );
    expect(third.deletedMessageIds).toEqual(["deleted-on-next-page"]);
    expect(third.hasMore).toBe(false);
    expect(decodeMailboxSyncCursor(third.cursor, "google").historyId).toBe(
      "300",
    );
  });
});

describe("getGmailMailboxChangeIds", () => {
  it("deduplicates updates and lets deletion win within one page", () => {
    const result = getGmailMailboxChangeIds([
      {
        messagesAdded: [
          { message: { id: "added" } },
          { message: { id: "deleted" } },
        ],
        labelsAdded: [{ message: { id: "label-change" } }],
        labelsRemoved: [
          { message: { id: "label-change" } },
          { message: { id: "deleted" } },
        ],
        messagesDeleted: [{ message: { id: "deleted" } }],
      },
    ]);

    expect(result.upsertIds).toEqual(["added", "label-change"]);
    expect(result.deletedIds).toEqual(new Set(["deleted"]));
  });

  it("fetches summary messages when Gmail omits typed history arrays", () => {
    const result = getGmailMailboxChangeIds([
      {
        messages: [{ id: "archived", threadId: "alert-thread" }],
      },
    ]);

    expect(result.upsertIds).toEqual(["archived"]);
    expect(result.changedThreadIds).toEqual(new Set(["alert-thread"]));
  });
});

describe("Gmail mailbox changes over the mail API source", () => {
  it("keeps every change within protocol bounds and ends with the deletions", async () => {
    const addedIds = Array.from(
      { length: 700 },
      (_, index) => `added-${index}`,
    );
    const deletedIds = Array.from(
      { length: 700 },
      (_, index) => `deleted-${index}`,
    );
    vi.mocked(getHistory).mockResolvedValue({
      history: [historyRecord({ added: addedIds, deleted: deletedIds })],
      historyId: "200",
    });
    stubFetchedMessages();

    const source = createEmailProviderMailboxSource({
      accountId: "acc-1",
      provider: {
        name: "google",
        localMailSyncStrategy: "history",
        async getMailboxSyncPage({
          cursor,
          after: syncAfter,
          limit,
        }: {
          cursor?: string;
          after?: Date;
          limit: number;
        }) {
          return getGmailMailboxSyncPage({
            gmail: {} as never,
            accessToken: "access-token",
            logger,
            cursor,
            after: syncAfter,
            limit,
          });
        },
      } as unknown as EmailProvider,
    });

    let position: {
      streamId: string;
      generation: string;
      checkpoint: string | null;
    } = { streamId: "primary", generation: "g1", checkpoint: deltaCursor() };
    const changes: ProviderChange[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await source.readChanges({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: `r${index}`,
        position,
        pageSize: 100,
        signal: new AbortController().signal,
      });
      if (result.status !== "page") throw new Error("expected a page");
      expect(() => syncPageSchema.parse(result.page)).not.toThrow();
      expect(result.page.changes.length).toBeLessThanOrEqual(
        MAX_SYNC_PAGE_CHANGES,
      );
      expect(result.page.requiredHydration.length).toBeLessThanOrEqual(
        MAX_SYNC_PAGE_CHANGES,
      );
      changes.push(...result.page.changes);
      position = result.page.to;
      if (result.page.roundComplete) break;
    }

    expect(
      changes.filter((change) => change.kind === "message_patch"),
    ).toHaveLength(addedIds.length);
    expect(
      changes.flatMap((change) =>
        change.kind === "message_deleted" ? [change.key.messageId] : [],
      ),
    ).toEqual(deletedIds);
    if (!position.checkpoint) throw new Error("expected a checkpoint");
    expect(
      decodeMailboxSyncCursor(position.checkpoint, "google").historyId,
    ).toBe("200");
  });
});

function deltaCursor(historyId = "100") {
  return encodeMailboxSyncCursor({
    version: 1,
    provider: "google",
    phase: "delta",
    historyId,
    after,
  });
}

function historyRecord({
  id,
  added = [],
  deleted = [],
}: {
  id?: string;
  added?: string[];
  deleted?: string[];
}) {
  return {
    ...(id ? { id } : {}),
    ...(added.length > 0
      ? {
          labelsAdded: added.map((messageId) => ({
            message: { id: messageId, threadId: `thread-${messageId}` },
          })),
        }
      : {}),
    ...(deleted.length > 0
      ? {
          messagesDeleted: deleted.map((messageId) => ({
            message: { id: messageId },
          })),
        }
      : {}),
  };
}

function stubFetchedMessages() {
  vi.mocked(getMessagesBatch).mockImplementation(async ({ messageIds }) =>
    messageIds.map((id) => ({
      ...getMockMessage({
        id,
        labelIds: ["INBOX"],
        date: "2026-07-02T00:00:00.000Z",
      }),
      internalDate: recentInternalDate,
    })),
  );
}
