// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailMutation } from "@/utils/email-cache/mail-mutations";
import type { ListThread } from "./types";
import { useThreadActions } from "./use-thread-actions";

const outbox = vi.hoisted(() => ({
  cancel: vi.fn(),
  enqueue: vi.fn(),
}));
const notifications = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/utils/email-cache/mail-mutations", () => ({
  cancelPendingMailMutation: outbox.cancel,
  enqueueMailMutation: outbox.enqueue,
}));
vi.mock("sonner", () => ({ toast: notifications }));

describe("useThreadActions durable mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outbox.cancel.mockResolvedValue(true);
    outbox.enqueue.mockImplementation(async (input) =>
      createMutation(input.kind, input.id),
    );
  });

  it("does not resolve an archive until its exact snapshot is durable", async () => {
    let persist: ((mutation: MailMutation) => void) | undefined;
    outbox.enqueue.mockReturnValue(
      new Promise<MailMutation>((resolve) => {
        persist = resolve;
      }),
    );
    const { result } = renderActions();

    let queued: string[] | undefined;
    const action = act(async () => {
      queued = await result.current.archive(["thread"]);
    });

    expect(outbox.enqueue).toHaveBeenCalledWith({
      batchId: expect.any(String),
      emailAccountId: "account",
      kind: "archive",
      messageIds: ["message-one", "message-two"],
      threadId: "thread",
    });
    expect(queued).toBeUndefined();

    persist?.(createMutation("archive"));
    await action;

    expect(queued).toEqual(["thread"]);
  });

  it("queues the complete provider snapshot when displayed messages are filtered", async () => {
    const { result } = renderActions({
      threads: [
        createThread(["INBOX"], {
          messageIds: ["message-one", "message-two", "filtered-message"],
        }),
      ],
    });

    await act(() => result.current.archive(["thread"]));

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "archive",
        messageIds: ["message-one", "message-two", "filtered-message"],
      }),
    );
  });

  it("leaves a row unchanged when its mutation cannot be stored", async () => {
    outbox.enqueue.mockRejectedValue(new Error("IndexedDB unavailable"));
    const { result } = renderActions();

    let queued: string[] = [];
    await act(async () => {
      queued = await result.current.trash(["thread"]);
    });

    expect(queued).toEqual([]);
    expect(notifications.error).toHaveBeenCalledWith("Couldn't queue deletion");
  });

  it("reports actions whose reader target has no retained list row", async () => {
    const { result } = renderActions({ threads: [] });

    await act(() => result.current.archive(["missing-thread"]));
    await act(() => result.current.setReadState(["missing-thread"], true));
    await act(() =>
      result.current.snooze(
        ["missing-thread"],
        new Date("2026-08-26T09:00:00Z"),
      ),
    );

    expect(notifications.error).toHaveBeenCalledTimes(3);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("counts unresolved rows in partial-action feedback", async () => {
    const { result } = renderActions();

    await act(() => result.current.archive(["thread", "missing-thread"]));

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(notifications.error).toHaveBeenCalledWith(
      "Couldn't queue 1 of 2 for archiving",
    );
  });

  it("does not resolve a read change before the durable overlay can observe it", async () => {
    let persist: ((mutation: MailMutation) => void) | undefined;
    outbox.enqueue.mockReturnValue(
      new Promise<MailMutation>((resolve) => {
        persist = resolve;
      }),
    );
    const { result } = renderActions();

    let queued: string[] | undefined;
    const action = act(async () => {
      queued = await result.current.setReadState(["thread"], true);
    });
    expect(queued).toBeUndefined();

    persist?.(createMutation("set_read_state"));
    await action;

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account",
        kind: "set_read_state",
        messageIds: ["message-one", "message-two"],
        read: true,
        threadId: "thread",
      }),
    );
    expect(queued).toEqual(["thread"]);
  });

  it("confirms explicit read-state changes after they are durable", async () => {
    const { result } = renderActions();

    await act(() => result.current.setReadState(["thread"], false));

    expect(notifications.success).toHaveBeenCalledWith("Marked as unread");
  });

  it("does not notify for automatic mark-read changes", async () => {
    const { result } = renderActions();

    await act(() => result.current.markRead(["thread"]));

    expect(notifications.success).not.toHaveBeenCalled();
  });

  it("queues same-id combined rows under their owning accounts in one batch", async () => {
    const threads = [
      createThread(["INBOX"], {
        account: { id: "account-one", email: "one@example.com" },
      }),
      createThread(["INBOX"], {
        account: { id: "account-two", email: "two@example.com" },
      }),
    ];
    const { result } = renderActions({ threads });

    await act(() =>
      result.current.archive(["account-one:thread", "account-two:thread"]),
    );

    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    expect(outbox.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        emailAccountId: "account-one",
        threadId: "thread",
      }),
    );
    expect(outbox.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        emailAccountId: "account-two",
        threadId: "thread",
      }),
    );
    const firstBatchId = outbox.enqueue.mock.calls[0]?.[0].batchId;
    expect(outbox.enqueue.mock.calls[1]?.[0].batchId).toBe(firstBatchId);
  });

  it("queues snooze snapshots for the durable visibility overlay", async () => {
    const { result } = renderActions();
    const until = new Date("2026-08-16T09:00:00.000Z");

    await act(() => result.current.snooze(["thread"], until));

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "snooze",
        scheduledFor: until.toISOString(),
      }),
    );
  });

  it("retains the opened snapshot after the durable overlay hides its row", async () => {
    const thread = createThread(["INBOX", "UNREAD"]);
    const { result, rerender } = renderHook(
      ({ threads }: { threads: ListThread[] }) =>
        useThreadActions({ emailAccountId: "account", threads }),
      { initialProps: { threads: [thread] } },
    );
    rerender({ threads: [] });

    await act(() => result.current.setReadState(["thread"], false));

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account",
        messageIds: ["message-one", "message-two"],
        read: false,
        threadId: "thread",
      }),
    );
  });

  it("does not reuse a same-id snapshot after the account route changes", async () => {
    const oldThread = createThread(["INBOX"]);
    const newThread = createThread(["INBOX"]);
    newThread.messages = newThread.messages.map((message) => ({
      ...message,
      id: `new-${message.id}`,
    }));
    newThread.messageIds = newThread.messageIds.map(
      (messageId) => `new-${messageId}`,
    );
    const { result, rerender } = renderHook(
      ({ emailAccountId, threads }) =>
        useThreadActions({ emailAccountId, threads }),
      {
        initialProps: {
          emailAccountId: "account-one",
          threads: [oldThread],
        },
      },
    );
    rerender({ emailAccountId: "account-two", threads: [newThread] });

    await act(() => result.current.archive(["thread"]));

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-two",
        messageIds: ["new-message-one", "new-message-two"],
        threadId: "thread",
      }),
    );
  });

  it("undo cancels a pending archive so the durable overlay restores it", async () => {
    const { result } = renderActions();

    await act(() => result.current.archive(["thread"]));
    await act(() => result.current.undo());

    expect(outbox.cancel).toHaveBeenCalledWith("mutation-id");
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(notifications.success).toHaveBeenCalledWith("Restored");
  });

  it("undo queues compensation with the original snapshot when work started", async () => {
    outbox.cancel.mockResolvedValue(false);
    const { result } = renderActions();

    await act(() => result.current.trash(["thread"]));
    await act(() => result.current.undo());

    expect(outbox.enqueue).toHaveBeenNthCalledWith(2, {
      batchId: expect.any(String),
      emailAccountId: "account",
      kind: "untrash",
      messageIds: ["message-one", "message-two"],
      threadId: "thread",
    });
    expect(notifications.success).toHaveBeenCalledWith("Restored");
  });

  it("does not restore an undo whose compensation cannot be persisted", async () => {
    outbox.cancel.mockResolvedValue(false);
    outbox.enqueue
      .mockResolvedValueOnce(createMutation("archive"))
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(createMutation("unarchive"));
    const { result } = renderActions();

    await act(() => result.current.archive(["thread"]));
    await act(() => result.current.undo());

    expect(notifications.error).toHaveBeenCalledWith("Couldn't restore");

    await act(() => result.current.undo());

    expect(outbox.enqueue).toHaveBeenCalledTimes(3);
    expect(notifications.success).toHaveBeenCalledWith("Restored");
  });
});

function renderActions({
  threads = [createThread(["INBOX", "UNREAD"])],
}: {
  threads?: ListThread[];
} = {}) {
  return renderHook(() =>
    useThreadActions({
      emailAccountId: "account",
      threads,
    }),
  );
}

function createThread(
  labelIds: string[],
  extra: Partial<ListThread> = {},
): ListThread {
  return {
    id: "thread",
    messageIds: ["message-one", "message-two"],
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: [
      {
        id: "message-one",
        threadId: "thread",
        snippet: "snippet",
        subject: "Subject",
        date: "0",
        internalDate: "0",
        labelIds,
        headers: { subject: "Subject" },
      },
      {
        id: "message-two",
        threadId: "thread",
        snippet: "snippet",
        subject: "Subject",
        date: "1",
        internalDate: "1",
        labelIds,
        headers: { subject: "Subject" },
      },
    ],
    ...extra,
  } as ListThread;
}

function createMutation(
  kind: MailMutation["kind"],
  id = "mutation-id",
): MailMutation {
  return {
    id,
    batchId: id,
    emailAccountId: "account",
    threadId: "thread",
    messageIds: ["message-one", "message-two"],
    kind,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...(kind === "set_read_state" ? { read: true } : {}),
  } as MailMutation;
}
