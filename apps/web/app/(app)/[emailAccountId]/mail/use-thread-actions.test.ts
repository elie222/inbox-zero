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

vi.mock("@/store/archive-queue", () => ({
  archiveEmails: queue.archive,
  cancelQueuedThreads: queue.cancel,
  deleteEmails: queue.trash,
  markReadThreads: queue.markRead,
}));
vi.mock("@/utils/actions/mail", () => ({
  markReadThreadAction,
  unarchiveThreadAction: vi.fn(),
  untrashThreadAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: notifications }));

describe("useThreadActions read state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markReadThreadAction.mockResolvedValue({});
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

    await act(() => result.current.setReadState("thread", false));

    expect(markReadThreadAction).toHaveBeenCalledWith("account", {
      threadId: "thread",
      read: false,
    });
    expect(transaction.commit).toHaveBeenCalledWith("thread");
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

    await act(() => result.current.setReadState("thread", true));

    expect(transaction.rollback).toHaveBeenCalledWith(["thread"]);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith("Couldn't mark as read");
  });
});

function createThread(labelIds: string[]): ListThread {
  return {
    id: "thread",
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: [
      {
        id: "message",
        threadId: "thread",
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
