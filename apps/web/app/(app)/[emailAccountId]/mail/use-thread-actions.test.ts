// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListThread } from "./types";
import { useThreadActions } from "./use-thread-actions";

const queue = vi.hoisted(() => ({
  archive: vi.fn(),
  cancel: vi.fn(),
  markRead: vi.fn(),
  trash: vi.fn(),
}));
const notifications = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const markReadThreadAction = vi.hoisted(() => vi.fn());
const bulkArchiveThreadsAction = vi.hoisted(() => vi.fn());
const snoozeThreadsAction = vi.hoisted(() => vi.fn());
const mailboxCache = vi.hoisted(() => ({
  markRead: vi.fn(),
  remove: vi.fn(),
}));
const mailboxSync = vi.hoisted(() => ({ request: vi.fn() }));
const reverseActions = vi.hoisted(() => ({
  unarchive: vi.fn(),
  untrash: vi.fn(),
}));

vi.mock("@/store/archive-queue", () => ({
  archiveEmails: queue.archive,
  cancelQueuedThreads: queue.cancel,
  deleteEmails: queue.trash,
  markReadThreads: queue.markRead,
}));
vi.mock("@/utils/actions/mail", () => ({
  markReadThreadAction,
  unarchiveThreadAction: reverseActions.unarchive,
  untrashThreadAction: reverseActions.untrash,
}));
vi.mock("@/utils/actions/mail-bulk-action", () => ({
  bulkArchiveThreadsAction,
}));
vi.mock("@/utils/actions/snooze", () => ({ snoozeThreadsAction }));
vi.mock("@/utils/email-cache/mailbox", () => ({
  markSyncedMailboxThreadsRead: mailboxCache.markRead,
  removeSyncedMailboxThreads: mailboxCache.remove,
}));
vi.mock("./use-mailbox-sync", () => ({
  requestMailboxSync: mailboxSync.request,
}));
vi.mock("sonner", () => ({ toast: notifications }));

describe("useThreadActions read state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markReadThreadAction.mockResolvedValue({});
    mailboxCache.markRead.mockResolvedValue(undefined);
    mailboxCache.remove.mockResolvedValue(undefined);
    reverseActions.unarchive.mockResolvedValue({});
    reverseActions.untrash.mockResolvedValue({});
    snoozeThreadsAction.mockResolvedValue({
      data: { failedThreadIds: [], succeededThreadIds: ["thread"] },
    });
    bulkArchiveThreadsAction.mockImplementation(
      async (
        _emailAccountId,
        input: { threads: Array<{ threadId: string }> },
      ) => ({
        data: {
          failedThreadIds: [],
          succeededThreadIds: input.threads.map((thread) => thread.threadId),
        },
      }),
    );
    queue.cancel.mockImplementation(({ threadIds }) => ({
      cancelled: [],
      notCancelled: threadIds,
    }));
  });

  it("marks an unread row locally before queueing the provider update", () => {
    const transaction = {
      threadIds: ["thread"],
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const optimisticallyUpdateThreads = vi.fn((_ids, updater) => {
      expect(
        updater(createThread(["INBOX", "UNREAD"])).messages[0]?.labelIds,
      ).toEqual(["INBOX"]);
      return transaction;
    });
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads,
      }),
    );

    act(() => result.current.markRead(["thread"]));

    expect(optimisticallyUpdateThreads).toHaveBeenCalledOnce();
    expect(queue.markRead).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account",
        threadIds: ["thread"],
      }),
    );

    const callbacks = queue.markRead.mock.calls[0]?.[0];
    callbacks.onSuccess("thread");
    expect(transaction.commit).toHaveBeenCalledWith("thread");
    expect(mailboxCache.markRead).toHaveBeenCalledWith({
      emailAccountId: "account",
      read: true,
      threadIds: ["thread"],
    });
  });

  it("rolls back failed rows together after the batch settles", () => {
    const transaction = {
      threadIds: ["thread-one", "thread-two"],
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads: vi.fn(() => transaction),
      }),
    );

    act(() => result.current.markRead(["thread-one", "thread-two"]));
    const callbacks = queue.markRead.mock.calls[0]?.[0];
    callbacks.onError("thread-one");
    callbacks.onError("thread-two");

    expect(transaction.rollback).not.toHaveBeenCalled();
    callbacks.onSettled();

    expect(transaction.rollback).toHaveBeenCalledOnce();
    expect(transaction.rollback).toHaveBeenCalledWith([
      "thread-one",
      "thread-two",
    ]);
    expect(notifications.error).toHaveBeenCalledWith(
      "There was an error marking as read",
    );
  });

  it("does not queue threads that were already read", () => {
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads: vi.fn(() => ({
          threadIds: [],
          commit: vi.fn(),
          rollback: vi.fn(),
        })),
      }),
    );

    act(() => result.current.markRead(["thread"]));

    expect(queue.markRead).not.toHaveBeenCalled();
  });

  it("optimistically toggles read state from the actions menu", async () => {
    const transaction = {
      threadIds: ["thread"],
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const optimisticallyUpdateThreads = vi.fn((_ids, updater) => {
      expect(updater(createThread(["INBOX"])).messages[0]?.labelIds).toEqual([
        "INBOX",
        "UNREAD",
      ]);
      return transaction;
    });
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads,
      }),
    );

    await act(() => result.current.setReadState(["thread"], false));

    expect(markReadThreadAction).toHaveBeenCalledWith("account", {
      threadId: "thread",
      read: false,
    });
    expect(transaction.commit).toHaveBeenCalledWith("thread");
    expect(mailboxCache.markRead).toHaveBeenCalledWith({
      emailAccountId: "account",
      read: false,
      threadIds: ["thread"],
    });
  });

  it("rolls back a rejected read-state toggle", async () => {
    markReadThreadAction.mockRejectedValue(new Error("offline"));
    const transaction = {
      threadIds: ["thread"],
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads: vi.fn(() => transaction),
      }),
    );

    await act(() => result.current.setReadState(["thread"], true));

    expect(transaction.rollback).toHaveBeenCalledWith(["thread"]);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith("Couldn't mark as read");
  });

  it("restores only rows that failed to snooze", async () => {
    const removal = { entries: new Map(), viewIdentity: "view" };
    const removeThreads = vi.fn(() => removal);
    const restoreThreads = vi.fn();
    snoozeThreadsAction.mockResolvedValue({
      data: {
        failedThreadIds: ["thread-two"],
        succeededThreadIds: ["thread-one"],
      },
    });
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads,
        restoreThreads,
        optimisticallyUpdateThreads: vi.fn(),
      }),
    );
    const until = new Date("2026-08-16T09:00:00.000Z");

    await act(() => result.current.snooze(["thread-one", "thread-two"], until));

    expect(removeThreads).toHaveBeenCalledWith(["thread-one", "thread-two"]);
    expect(snoozeThreadsAction).toHaveBeenCalledWith("account", {
      threadIds: ["thread-one", "thread-two"],
      snoozedUntil: until,
    });
    expect(restoreThreads).toHaveBeenCalledWith(removal, ["thread-two"]);
    expect(mailboxCache.remove).toHaveBeenCalledWith({
      emailAccountId: "account",
      threadIds: ["thread-one"],
    });
  });

  it("archives 300 conversations with one bulk action", async () => {
    const threads = Array.from({ length: 300 }, (_, index) =>
      createThread(["INBOX"], `thread-${index}`),
    );
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(() => ({
          entries: new Map(),
          viewIdentity: "view",
        })),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads: vi.fn(),
      }),
    );

    await act(() => result.current.archive(threads));

    expect(queue.archive).not.toHaveBeenCalled();
    expect(bulkArchiveThreadsAction).toHaveBeenCalledOnce();
    expect(bulkArchiveThreadsAction).toHaveBeenCalledWith("account", {
      threads: threads.map((thread) => ({
        threadId: thread.id,
        messageIds: thread.messageIds,
      })),
    });
    expect(mailboxCache.remove).toHaveBeenCalledWith({
      emailAccountId: "account",
      threadIds: threads.map((thread) => thread.id),
    });
    expect(mailboxSync.request).toHaveBeenCalledWith("account");
  });

  it("restores only conversations rejected by the bulk provider", async () => {
    const removal = { entries: new Map(), viewIdentity: "view" };
    const restoreThreads = vi.fn();
    bulkArchiveThreadsAction.mockResolvedValue({
      data: {
        failedThreadIds: ["thread-two"],
        succeededThreadIds: ["thread-one"],
      },
    });
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(() => removal),
        restoreThreads,
        optimisticallyUpdateThreads: vi.fn(),
      }),
    );

    await act(() =>
      result.current.archive([
        createThread(["INBOX"], "thread-one"),
        createThread(["INBOX"], "thread-two"),
      ]),
    );

    expect(restoreThreads).toHaveBeenCalledWith(removal, ["thread-two"]);
    expect(mailboxCache.remove).toHaveBeenCalledWith({
      emailAccountId: "account",
      threadIds: ["thread-one"],
    });
    expect(notifications.error).toHaveBeenCalledWith(
      "Couldn't archive 1 of 2 conversations",
    );
  });

  it("requests a fresh delta after undo restores a local row", async () => {
    const removal = { entries: new Map(), viewIdentity: "view" };
    const restoreThreads = vi.fn();
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(() => removal),
        restoreThreads,
        optimisticallyUpdateThreads: vi.fn(),
      }),
    );

    await act(() => result.current.archive([createThread(["INBOX"])]));
    await act(() => result.current.undo());

    expect(reverseActions.unarchive).toHaveBeenCalledWith("account", {
      threadId: "thread",
    });
    expect(restoreThreads).toHaveBeenCalledWith(removal, ["thread"]);
    expect(mailboxSync.request).toHaveBeenCalledWith("account");
  });

  it("chunks snooze actions at the server validation limit", async () => {
    const threadIds = Array.from(
      { length: 101 },
      (_, index) => `thread-${index}`,
    );
    snoozeThreadsAction.mockImplementation(
      async (_emailAccountId, input: { threadIds: string[] }) => ({
        data: {
          failedThreadIds: [],
          succeededThreadIds: input.threadIds,
        },
      }),
    );
    const { result } = renderHook(() =>
      useThreadActions({
        emailAccountId: "account",
        removeThreads: vi.fn(() => ({
          entries: new Map(),
          viewIdentity: "view",
        })),
        restoreThreads: vi.fn(),
        optimisticallyUpdateThreads: vi.fn(),
      }),
    );

    await act(() =>
      result.current.snooze(threadIds, new Date("2026-08-16T09:00:00.000Z")),
    );

    expect(snoozeThreadsAction).toHaveBeenCalledTimes(2);
    expect(
      snoozeThreadsAction.mock.calls.map((call) => call[1].threadIds),
    ).toEqual([threadIds.slice(0, 100), threadIds.slice(100)]);
  });
});

function createThread(
  labelIds: string[],
  id = "thread",
  messageIds = [`${id}-message`],
): ListThread {
  return {
    id,
    messageIds,
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: [
      {
        id: messageIds[0] ?? `${id}-message`,
        threadId: id,
        snippet: "snippet",
        subject: "Subject",
        date: "0",
        internalDate: "0",
        labelIds,
        headers: { subject: "Subject" },
      },
    ],
  };
}
