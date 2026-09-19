// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnqueueThreadMailMutationBatch = vi.fn();
const mockFetchWithAccount = vi.fn();
let durableMutations: Array<Record<string, unknown>> = [];

vi.mock("@/utils/mail-engine/thread-mail-mutations", () => ({
  enqueueThreadMailMutationBatch: (
    ...args: Parameters<typeof mockEnqueueThreadMailMutationBatch>
  ) => mockEnqueueThreadMailMutationBatch(...args),
}));

vi.mock("@/utils/fetch", () => ({
  fetchWithAccount: (...args: Parameters<typeof mockFetchWithAccount>) =>
    mockFetchWithAccount(...args),
}));

describe("archive sender queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    durableMutations = [];
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [] }),
    });
    mockEnqueueThreadMailMutationBatch.mockImplementation(async (input) => {
      const batchId = `batch-${durableMutations.length + 1}`;
      const mutations = createMutations(input, batchId, "succeeded");
      durableMutations.push(...mutations);
      return { batchId, mutations };
    });
  });

  it("keeps sender status scoped to the email account", async () => {
    const { jotaiStore } = await import("@/store");
    const { useArchiveSenderQueueActions, useArchiveSenderStatus } =
      await import("./archive-sender-queue");
    const wrapper = createWrapper(jotaiStore);
    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: firstAccountStatus } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: secondAccountStatus } = renderHook(
      () => useArchiveSenderStatus("account-2", "sender@example.com"),
      { wrapper },
    );

    await act(async () => {
      await actionResult.current.queueArchiveSenders({
        senders: ["sender@example.com"],
      });
    });

    expect(firstAccountStatus.current).toMatchObject({
      status: "completed",
      threadsTotal: 0,
    });
    expect(secondAccountStatus.current).toBeUndefined();
  });

  it("dedupes sender queue requests case-insensitively", async () => {
    const { jotaiStore } = await import("@/store");
    const { useArchiveSenderQueueActions } = await import(
      "./archive-sender-queue"
    );
    const { result } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper: createWrapper(jotaiStore) },
    );

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await result.current.queueArchiveSenders({
        senders: ["Sender@example.com", " sender@example.com ", " "],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(mockFetchWithAccount).toHaveBeenCalledTimes(1);
    expect(mockFetchWithAccount).toHaveBeenCalledWith({
      url: "/api/threads/basic?fromEmail=Sender%40example.com&limit=100&labelId=INBOX",
      emailAccountId: "account-1",
    });
  });

  it("fetches every page and preserves exact snapshots and the archive label", async () => {
    const firstPageThreads = [
      { id: "thread-1", messages: [{ id: "message-1" }] },
      { id: "thread-2", messages: [{ id: "message-2" }] },
    ];
    const secondPageThreads = [
      {
        id: "thread-3",
        messages: [{ id: "message-3" }, { id: "message-4" }],
      },
    ];
    mockFetchWithAccount
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threads: firstPageThreads,
          nextPageToken: "page-2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ threads: secondPageThreads }),
      });
    const { addToArchiveSenderThreadQueue } = await import(
      "./archive-sender-queue"
    );

    await addToArchiveSenderThreadQueue({
      sender: "sender@example.com",
      labelId: "label-1",
      emailAccountId: "account-1",
    });

    expect(mockFetchWithAccount).toHaveBeenNthCalledWith(1, {
      url: "/api/threads/basic?fromEmail=sender%40example.com&limit=100&labelId=INBOX",
      emailAccountId: "account-1",
    });
    expect(mockFetchWithAccount).toHaveBeenNthCalledWith(2, {
      url: "/api/threads/basic?fromEmail=sender%40example.com&limit=100&labelId=INBOX&nextPageToken=page-2",
      emailAccountId: "account-1",
    });
    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenCalledWith({
      clientSource: { kind: "sender", sender: "sender@example.com" },
      emailAccountId: "account-1",
      payload: { kind: "archive", labelId: "label-1" },
      threads: [...firstPageThreads, ...secondPageThreads],
    });
  });

  it("reports queued progress until the durable batch is persisted", async () => {
    mockFetchWithAccount.mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [
          { id: "thread-1", messages: [{ id: "message-1" }] },
          { id: "thread-2", messages: [{ id: "message-2" }] },
        ],
      }),
    });
    let finishEnqueue: (() => void) | undefined;
    mockEnqueueThreadMailMutationBatch.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          finishEnqueue = () => {
            const mutations = createMutations(input, "batch-1", "succeeded");
            durableMutations.push(...mutations);
            resolve({ batchId: "batch-1", mutations });
          };
        }),
    );
    const { jotaiStore } = await import("@/store");
    const {
      addToArchiveSenderThreadQueue,
      useArchiveQueueProgress,
      useArchiveSenderStatus,
    } = await import("./archive-sender-queue");
    const wrapper = createWrapper(jotaiStore);
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: progressResult } = renderHook(
      () => useArchiveQueueProgress("account-1"),
      { wrapper },
    );

    let queuePromise!: Promise<boolean>;
    await act(async () => {
      queuePromise = addToArchiveSenderThreadQueue({
        sender: "sender@example.com",
        emailAccountId: "account-1",
      });
      await vi.waitFor(() =>
        expect(mockEnqueueThreadMailMutationBatch).toHaveBeenCalledOnce(),
      );
    });

    expect(statusResult.current).toEqual({
      status: "pending",
      threadIds: ["thread-1", "thread-2"],
      threadsTotal: 2,
    });
    expect(progressResult.current).toEqual({
      activeItems: 1,
      failedItems: 0,
      settledItems: 0,
      totalItems: 1,
      completedItems: 0,
    });

    await act(async () => {
      finishEnqueue?.();
      await queuePromise;
    });

    expect(statusResult.current).toEqual({
      batchId: "batch-1",
      status: "completed",
      threadIds: [],
      threadsTotal: 2,
    });
    expect(progressResult.current).toEqual({
      activeItems: 0,
      completedItems: 1,
      failedItems: 0,
      settledItems: 1,
      totalItems: 1,
    });
  });

  it("continues queueing other senders after one sender fails", async () => {
    mockFetchWithAccount
      .mockRejectedValueOnce(new Error("Failed to fetch first sender"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ threads: [] }),
      });
    const { jotaiStore } = await import("@/store");
    const { useArchiveSenderQueueActions } = await import(
      "./archive-sender-queue"
    );
    const { result } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper: createWrapper(jotaiStore) },
    );

    let queuedSenders = 0;
    await act(async () => {
      queuedSenders = await result.current.queueArchiveSenders({
        senders: ["first@example.com", "second@example.com"],
      });
    });

    expect(queuedSenders).toBe(1);
    expect(mockFetchWithAccount).toHaveBeenCalledTimes(2);
  });

  it("keeps failed fetches visible and allows retrying them", async () => {
    mockFetchWithAccount
      .mockRejectedValueOnce(new Error("Failed to fetch threads"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ threads: [] }),
      });
    const { jotaiStore } = await import("@/store");
    const {
      useArchiveQueueProgress,
      useArchiveSenderQueueActions,
      useArchiveSenderStatus,
    } = await import("./archive-sender-queue");
    const wrapper = createWrapper(jotaiStore);
    const { result: actionResult } = renderHook(
      () => useArchiveSenderQueueActions("account-1"),
      { wrapper },
    );
    const { result: statusResult } = renderHook(
      () => useArchiveSenderStatus("account-1", "sender@example.com"),
      { wrapper },
    );
    const { result: progressResult } = renderHook(
      () => useArchiveQueueProgress("account-1"),
      { wrapper },
    );

    await act(async () => {
      await expect(
        actionResult.current.queueArchiveSenders({
          senders: ["sender@example.com"],
        }),
      ).resolves.toBe(0);
    });

    expect(statusResult.current).toMatchObject({
      status: "failed",
      threadsTotal: 0,
    });
    expect(progressResult.current).toEqual({
      activeItems: 0,
      completedItems: 0,
      failedItems: 1,
      settledItems: 1,
      totalItems: 1,
    });

    await act(async () => {
      await expect(
        actionResult.current.queueArchiveSenders({
          senders: ["sender@example.com"],
        }),
      ).resolves.toBe(1);
    });

    expect(statusResult.current).toMatchObject({
      status: "completed",
      threadsTotal: 0,
    });
  });
});

function createWrapper(store: typeof import("@/store")["jotaiStore"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function createMutations(
  input: {
    clientSource: { kind: "sender"; sender: string };
    emailAccountId: string;
    payload: Record<string, unknown>;
    threads: Array<{ id: string; messages: Array<{ id: string }> }>;
  },
  batchId: string,
  status: string,
  now = 1,
) {
  return input.threads.map((thread) => ({
    ...input.payload,
    id: `${batchId}-${thread.id}`,
    batchId,
    clientSource: input.clientSource,
    emailAccountId: input.emailAccountId,
    threadId: thread.id,
    messageIds: thread.messages.map((message) => message.id),
    status,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  }));
}
