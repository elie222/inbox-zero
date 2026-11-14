import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
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

  it("paginates an oversized history record into bounded pages without skipping deletions", async () => {
    vi.mocked(getHistory).mockResolvedValue({
      history: [
        {
          messagesDeleted: [
            { message: { id: "del-1", threadId: "t-1" } },
            { message: { id: "del-2", threadId: "t-1" } },
          ],
          messagesAdded: [
            { message: { id: "add-1", threadId: "t-2" } },
            { message: { id: "add-2", threadId: "t-2" } },
            { message: { id: "add-3", threadId: "t-3" } },
          ],
        },
      ],
      historyId: "200",
    });

    const recentDate = new Date("2026-07-02T00:00:00.000Z")
      .getTime()
      .toString();
    vi.mocked(getMessagesBatch).mockImplementation(async (ids) =>
      ids.map((id) => ({
        ...getMockMessage({ id, threadId: id === "add-3" ? "t-3" : "t-2" }),
        internalDate: recentDate,
      })),
    );

    const baseInput = {
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      limit: 100,
      maxChanges: 2,
    };

    const initialCursor = encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "100",
      after: "2026-07-01T00:00:00.000Z",
    });

    // Page 1: returns first 2 changes (deletions), keeps historyId at 100
    const page1 = await getGmailMailboxSyncPage({
      ...baseInput,
      cursor: initialCursor,
    });
    expect(page1.deletedMessageIds).toEqual(["del-1", "del-2"]);
    expect(page1.upsertedMessages).toEqual([]);
    expect(page1.changedThreadIds).toEqual(["t-1"]);
    expect(page1.hasMore).toBe(true);
    const decoded1 = decodeMailboxSyncCursor(page1.cursor, "google");
    expect(decoded1.historyId).toBe("100");
    expect(decoded1.offset).toBe(2);

    // Page 2: returns next 2 changes (add-1, add-2), keeps historyId at 100
    const page2 = await getGmailMailboxSyncPage({
      ...baseInput,
      cursor: page1.cursor,
    });
    expect(page2.deletedMessageIds).toEqual([]);
    expect(page2.upsertedMessages.map((m) => m.id)).toEqual(["add-1", "add-2"]);
    expect(page2.changedThreadIds).toEqual(["t-2"]);
    expect(page2.hasMore).toBe(true);
    const decoded2 = decodeMailboxSyncCursor(page2.cursor, "google");
    expect(decoded2.historyId).toBe("100");
    expect(decoded2.offset).toBe(4);

    // Page 3: returns final change (add-3), advances historyId to 200, clears offset
    const page3 = await getGmailMailboxSyncPage({
      ...baseInput,
      cursor: page2.cursor,
    });
    expect(page3.deletedMessageIds).toEqual([]);
    expect(page3.upsertedMessages.map((m) => m.id)).toEqual(["add-3"]);
    expect(page3.changedThreadIds).toEqual(["t-3"]);
    expect(page3.hasMore).toBe(false);
    const decoded3 = decodeMailboxSyncCursor(page3.cursor, "google");
    expect(decoded3.historyId).toBe("200");
    expect(decoded3.offset).toBeUndefined();
  });

  it("interrupted or retried pagination neither skips changes nor advances past unapplied deletions", async () => {
    vi.mocked(getHistory).mockResolvedValue({
      history: [
        {
          messagesDeleted: [
            { message: { id: "del-1" } },
            { message: { id: "del-2" } },
          ],
          messagesAdded: [{ message: { id: "add-1" } }],
        },
      ],
      historyId: "200",
    });

    const recentDate = new Date("2026-07-02T00:00:00.000Z")
      .getTime()
      .toString();
    vi.mocked(getMessagesBatch).mockResolvedValue([
      {
        ...getMockMessage({ id: "add-1" }),
        internalDate: recentDate,
      },
    ]);

    const baseInput = {
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      limit: 100,
      maxChanges: 2,
    };

    const initialCursor = encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "100",
      after: "2026-07-01T00:00:00.000Z",
    });

    // Requesting page 1 twice produces identical results without skipping
    const attempt1 = await getGmailMailboxSyncPage({
      ...baseInput,
      cursor: initialCursor,
    });
    const attempt2 = await getGmailMailboxSyncPage({
      ...baseInput,
      cursor: initialCursor,
    });
    expect(attempt1.deletedMessageIds).toEqual(["del-1", "del-2"]);
    expect(attempt2.deletedMessageIds).toEqual(["del-1", "del-2"]);
    expect(attempt1.cursor).toEqual(attempt2.cursor);

    // Retrying page 2 with page 1's cursor yields the remaining addition
    const page2 = await getGmailMailboxSyncPage({
      ...baseInput,
      cursor: attempt1.cursor,
    });
    expect(page2.upsertedMessages.map((m) => m.id)).toEqual(["add-1"]);
    expect(page2.deletedMessageIds).toEqual([]);
    expect(page2.hasMore).toBe(false);
    expect(decodeMailboxSyncCursor(page2.cursor, "google").historyId).toBe(
      "200",
    );
  });

  it("handles a single oversized history record exceeding the 1,000-item schema bound with default maxChanges", async () => {
    const deletedCount = 1001;
    vi.mocked(getHistory).mockResolvedValue({
      history: [
        {
          messagesDeleted: Array.from({ length: deletedCount }, (_, i) => ({
            message: { id: `del-${String(i).padStart(4, "0")}` },
          })),
        },
      ],
      historyId: "300",
    });

    const initialCursor = encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: "delta",
      historyId: "100",
      after: "2026-07-01T00:00:00.000Z",
    });

    // Page 1: returns first 1,000 deletions, hasMore = true, historyId stays at 100
    const page1 = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      limit: 100,
      cursor: initialCursor,
    });
    expect(page1.deletedMessageIds).toHaveLength(1000);
    expect(page1.upsertedMessages).toHaveLength(0);
    expect(page1.hasMore).toBe(true);
    const decoded1 = decodeMailboxSyncCursor(page1.cursor, "google");
    expect(decoded1.historyId).toBe("100");
    expect(decoded1.offset).toBe(1000);

    // Page 2: returns remaining 1 deletion, hasMore = false, historyId advances to 300
    const page2 = await getGmailMailboxSyncPage({
      gmail: {} as never,
      accessToken: "access-token",
      logger,
      limit: 100,
      cursor: page1.cursor,
    });
    expect(page2.deletedMessageIds).toHaveLength(1);
    expect(page2.deletedMessageIds[0]).toBe("del-1000");
    expect(page2.upsertedMessages).toHaveLength(0);
    expect(page2.hasMore).toBe(false);
    const decoded2 = decodeMailboxSyncCursor(page2.cursor, "google");
    expect(decoded2.historyId).toBe("300");
    expect(decoded2.offset).toBeUndefined();
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
