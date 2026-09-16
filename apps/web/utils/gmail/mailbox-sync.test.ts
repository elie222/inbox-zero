import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { encodeMailboxSyncCursor } from "@/utils/email/mailbox-sync";
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
