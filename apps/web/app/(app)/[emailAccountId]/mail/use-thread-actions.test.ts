// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import { useThreadActions } from "@/app/(app)/[emailAccountId]/mail/use-thread-actions";

const markReadThreadAction = vi.hoisted(() => vi.fn());

vi.mock("@/utils/actions/mail", () => ({
  markReadThreadAction,
  unarchiveThreadAction: vi.fn(),
  untrashThreadAction: vi.fn(),
}));

vi.mock("@/store/archive-queue", () => ({
  archiveEmails: vi.fn(),
  cancelQueuedThreads: vi.fn(() => ({ notCancelled: [] })),
  deleteEmails: vi.fn(),
}));

describe("useThreadActions markRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markReadThreadAction.mockResolvedValue({});
  });

  it("drops the unread label from every message in the thread", async () => {
    const { result, labelsOf } = setup([["INBOX", "UNREAD"], ["UNREAD"]]);

    await act(() => result.current.markRead("thread", true));

    expect(labelsOf()).toEqual([["INBOX"], []]);
    expect(markReadThreadAction).toHaveBeenCalledWith("account", {
      threadId: "thread",
      read: true,
    });
  });

  it("puts the unread label back when the provider refuses", async () => {
    markReadThreadAction.mockResolvedValue({ serverError: "nope" });
    const { result, labelsOf } = setup([["INBOX", "UNREAD"]]);

    await act(() => result.current.markRead("thread", true));

    expect(labelsOf()).toEqual([["INBOX", "UNREAD"]]);
  });

  it("marks unread without duplicating the label on messages that already have it", async () => {
    const { result, labelsOf } = setup([["INBOX", "UNREAD"], ["INBOX"]]);

    await act(() => result.current.markRead("thread", false));

    expect(labelsOf()).toEqual([
      ["INBOX", "UNREAD"],
      ["INBOX", "UNREAD"],
    ]);
  });
});

function setup(messageLabels: string[][]) {
  const thread = {
    id: "thread",
    messages: messageLabels.map((labelIds, index) => ({
      id: `message-${index}`,
      labelIds,
    })),
  } as unknown as ListThread;

  const rows = new Map<string, ListThread>([[thread.id, thread]]);

  const { result } = renderHook(() =>
    useThreadActions({
      emailAccountId: "account",
      removeThreads: vi.fn(),
      restoreThreads: vi.fn(),
      updateThreads: (threadIds, update) => {
        for (const threadId of threadIds) {
          const row = rows.get(threadId);
          if (row) rows.set(threadId, update(row));
        }
      },
    }),
  );

  return {
    result,
    labelsOf: () =>
      rows.get("thread")?.messages.map((message) => message.labelIds),
  };
}
