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

vi.mock("@/store/archive-queue", () => ({
  archiveEmails: queue.archive,
  cancelQueuedThreads: queue.cancel,
  deleteEmails: queue.trash,
  markReadThreads: queue.markRead,
}));
vi.mock("@/utils/actions/mail", () => ({
  unarchiveThreadAction: vi.fn(),
  untrashThreadAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: notifications }));

describe("useThreadActions read state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("rolls back only the failed row", () => {
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

    act(() => result.current.markRead(["thread"]));
    const callbacks = queue.markRead.mock.calls[0]?.[0];
    callbacks.onError("thread");

    expect(transaction.rollback).toHaveBeenCalledWith("thread");
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
