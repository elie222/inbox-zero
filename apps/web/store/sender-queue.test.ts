import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnqueueThreadMailMutationBatch = vi.fn();
const mockFetchAllSenderThreads = vi.fn();
let durableMutations: Array<Record<string, unknown>> = [];

vi.mock("@/utils/mail-engine/thread-mail-mutations", () => ({
  enqueueThreadMailMutationBatch: (
    ...args: Parameters<typeof mockEnqueueThreadMailMutationBatch>
  ) => mockEnqueueThreadMailMutationBatch(...args),
}));

vi.mock("./fetch-sender-threads", () => ({
  fetchAllSenderThreads: (
    ...args: Parameters<typeof mockFetchAllSenderThreads>
  ) => mockFetchAllSenderThreads(...args),
}));

describe("sender queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    globalThis.sessionStorage?.clear();
    durableMutations = [];
    mockFetchAllSenderThreads.mockResolvedValue({ threads: [] });
    mockEnqueueThreadMailMutationBatch.mockImplementation(async (input) => {
      const batchId = `batch-${durableMutations.length + 1}`;
      const mutations = input.threads.map(
        (thread: { id: string; messages: Array<{ id: string }> }) => ({
          ...input.payload,
          id: `${batchId}-${thread.id}`,
          batchId,
          clientSource: input.clientSource,
          emailAccountId: input.emailAccountId,
          threadId: thread.id,
          messageIds: thread.messages.map((message) => message.id),
          status: "succeeded",
          attempts: 0,
          nextAttemptAt: 1,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
      durableMutations.push(...mutations);
      return { batchId, mutations };
    });
  });

  it("durably enqueues exact thread snapshots before reporting success", async () => {
    const threads = [
      { id: "thread-1", messages: [{ id: "message-1" }] },
      {
        id: "thread-2",
        messages: [{ id: "message-2" }, { id: "message-3" }],
      },
    ];
    mockFetchAllSenderThreads.mockResolvedValue({ threads });
    const onSuccess = vi.fn();
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue } = createSenderQueue(() => ({ kind: "trash" }));

    const queued = await addToQueue({
      sender: "sender@example.com",
      emailAccountId: "account-1",
      onSuccess,
    });

    expect(queued).toBe(true);
    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenCalledWith({
      clientSource: { kind: "sender", sender: "sender@example.com" },
      emailAccountId: "account-1",
      payload: { kind: "trash" },
      threads,
    });
    expect(onSuccess).toHaveBeenCalledWith(2);
    expect(
      mockEnqueueThreadMailMutationBatch.mock.invocationCallOrder[0],
    ).toBeLessThan(onSuccess.mock.invocationCallOrder[0]);
  });

  it("dedupes senders case-insensitively while a batch is in flight", async () => {
    let releaseFetch: (() => void) | undefined;
    mockFetchAllSenderThreads.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFetch = () =>
            resolve({
              threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
            });
        }),
    );
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue } = createSenderQueue(() => ({ kind: "trash" }));

    const first = addToQueue({
      sender: " Sender@example.com ",
      emailAccountId: "account-1",
    });
    await Promise.resolve();
    await expect(
      addToQueue({
        sender: "sender@EXAMPLE.com",
        emailAccountId: "account-1",
      }),
    ).resolves.toBe(false);
    releaseFetch?.();
    await expect(first).resolves.toBe(true);
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    await expect(
      addToQueue({
        sender: "sender@example.com",
        emailAccountId: "account-2",
      }),
    ).resolves.toBe(true);

    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenCalledTimes(2);
    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ emailAccountId: "account-1" }),
    );
    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ emailAccountId: "account-2" }),
    );
  });

  it("completes zero-thread senders without writing an empty batch", async () => {
    const onSuccess = vi.fn();
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue } = createSenderQueue(() => ({
      kind: "set_read_state",
      read: true,
    }));

    await expect(
      addToQueue({
        sender: "sender@example.com",
        emailAccountId: "account-1",
        onSuccess,
      }),
    ).resolves.toBe(true);

    expect(mockEnqueueThreadMailMutationBatch).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(0);
  });

  it("surfaces storage failures and lets the sender be retried", async () => {
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    mockEnqueueThreadMailMutationBatch
      .mockRejectedValueOnce(new Error("Offline mail storage is unavailable"))
      .mockImplementationOnce(async (input) => {
        const mutations = input.threads.map(
          (thread: { id: string; messages: Array<{ id: string }> }) => ({
            ...input.payload,
            id: `batch-2-${thread.id}`,
            batchId: "batch-2",
            clientSource: input.clientSource,
            emailAccountId: input.emailAccountId,
            threadId: thread.id,
            messageIds: thread.messages.map((message) => message.id),
            status: "succeeded",
            attempts: 0,
            nextAttemptAt: 2,
            createdAt: 2,
            updatedAt: 2,
          }),
        );
        durableMutations.push(...mutations);
        return { batchId: "batch-2", mutations };
      });
    const onError = vi.fn();
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue } = createSenderQueue(() => ({ kind: "trash" }));

    await expect(
      addToQueue({
        sender: "sender@example.com",
        emailAccountId: "account-1",
        onError,
      }),
    ).rejects.toThrow("Offline mail storage is unavailable");
    await expect(
      addToQueue({
        sender: "SENDER@example.com",
        emailAccountId: "account-1",
      }),
    ).resolves.toBe(true);

    expect(onError).toHaveBeenCalledWith("sender@example.com");
    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenCalledTimes(2);
  });

  it("maps delete and mark-read sender actions to durable payloads", async () => {
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    const { addToDeleteSenderQueue } = await import("./delete-sender-queue");
    const { addToMarkReadSenderQueue } = await import(
      "./mark-read-sender-queue"
    );

    await addToDeleteSenderQueue({
      sender: "delete@example.com",
      emailAccountId: "account-1",
    });
    await addToMarkReadSenderQueue({
      sender: "read@example.com",
      emailAccountId: "account-1",
    });

    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ payload: { kind: "trash" } }),
    );
    expect(mockEnqueueThreadMailMutationBatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        payload: { kind: "set_read_state", read: true },
      }),
    );
  });

  it("drops sender-queue keys and leaves unrelated session storage", async () => {
    installMemorySessionStorage();
    sessionStorage.setItem(
      `inbox-zero:sender-queue:${JSON.stringify({ kind: "archive" })}`,
      JSON.stringify({ durable: [], progress: [], transient: [] }),
    );
    sessionStorage.setItem(
      `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`,
      JSON.stringify({ durable: [], progress: [], transient: [] }),
    );
    sessionStorage.setItem("inbox-zero:other", "keep");

    const { clearStoredSenderQueues } = await import("./sender-queue");
    clearStoredSenderQueues();

    expect(sessionStorage.getItem("inbox-zero:other")).toBe("keep");
    expect(
      sessionStorage.getItem(
        `inbox-zero:sender-queue:${JSON.stringify({ kind: "archive" })}`,
      ),
    ).toBeNull();
    expect(
      sessionStorage.getItem(
        `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`,
      ),
    ).toBeNull();
  });

  it("does not persist sender-queue keys after they are cleared", async () => {
    installMemorySessionStorage();
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    const { clearStoredSenderQueues, createSenderQueue } = await import(
      "./sender-queue"
    );
    const { addToQueue, clearStatuses } = createSenderQueue(() => ({
      kind: "trash",
    }));
    const storageKey = `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`;

    await addToQueue({
      sender: "sender@example.com",
      emailAccountId: "account-1",
    });
    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    clearStoredSenderQueues();
    clearStatuses("account-1");

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("does not persist a finishing fetch after stored sender queues are cleared", async () => {
    installMemorySessionStorage();
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    const { clearStoredSenderQueues, createSenderQueue } = await import(
      "./sender-queue"
    );
    const { addToQueue } = createSenderQueue(() => ({ kind: "trash" }));
    const storageKey = `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`;

    await addToQueue({
      sender: "first@example.com",
      emailAccountId: "account-1",
    });
    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    let releaseFetch: (() => void) | undefined;
    mockFetchAllSenderThreads.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFetch = () =>
            resolve({
              threads: [{ id: "thread-2", messages: [{ id: "message-2" }] }],
            });
        }),
    );
    const queued = addToQueue({
      sender: "second@example.com",
      emailAccountId: "account-1",
    });
    await Promise.resolve();
    clearStoredSenderQueues();
    releaseFetch?.();
    await queued;

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("does not restore a deleted account's queue after a finishing fetch", async () => {
    installMemorySessionStorage();
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-2", messages: [{ id: "message-2" }] }],
    });
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue, clearStatuses } = createSenderQueue(() => ({
      kind: "trash",
    }));
    const storageKey = `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`;

    await addToQueue({
      sender: "keep@example.com",
      emailAccountId: "account-2",
    });

    let releaseFetch: (() => void) | undefined;
    mockFetchAllSenderThreads.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFetch = () =>
            resolve({
              threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
            });
        }),
    );
    const queued = addToQueue({
      sender: "gone@example.com",
      emailAccountId: "account-1",
    });
    await Promise.resolve();
    clearStatuses("account-1");
    releaseFetch?.();
    await expect(queued).resolves.toBe(false);

    expect(storedAccountKeys(storageKey)).toEqual(
      new Set(["account-2:keep@example.com"]),
    );
  });

  it("does not persist a failed fetch after the account is cleared", async () => {
    installMemorySessionStorage();
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue, clearStatuses } = createSenderQueue(() => ({
      kind: "trash",
    }));
    const storageKey = `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`;

    await addToQueue({
      sender: "keep@example.com",
      emailAccountId: "account-2",
    });

    let rejectFetch: ((error: Error) => void) | undefined;
    mockFetchAllSenderThreads.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectFetch = reject;
        }),
    );
    const queued = addToQueue({
      sender: "gone@example.com",
      emailAccountId: "account-1",
    });
    await Promise.resolve();
    clearStatuses("account-1");
    rejectFetch?.(new Error("network"));
    await expect(queued).resolves.toBe(false);

    expect(storedAccountKeys(storageKey)).toEqual(
      new Set(["account-2:keep@example.com"]),
    );
  });

  it("does not restore a deleted account's queue after a finishing enqueue", async () => {
    installMemorySessionStorage();
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue, clearStatuses } = createSenderQueue(() => ({
      kind: "trash",
    }));
    const storageKey = `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`;

    await addToQueue({
      sender: "keep@example.com",
      emailAccountId: "account-2",
    });

    let releaseEnqueue: (() => void) | undefined;
    mockEnqueueThreadMailMutationBatch.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          releaseEnqueue = () => {
            const batchId = `batch-${durableMutations.length + 1}`;
            const mutations = input.threads.map(
              (thread: { id: string; messages: Array<{ id: string }> }) => ({
                ...input.payload,
                id: `${batchId}-${thread.id}`,
                batchId,
                clientSource: input.clientSource,
                emailAccountId: input.emailAccountId,
                threadId: thread.id,
                messageIds: thread.messages.map((message) => message.id),
                status: "succeeded",
                attempts: 0,
                nextAttemptAt: 1,
                createdAt: 1,
                updatedAt: 1,
              }),
            );
            durableMutations.push(...mutations);
            resolve({ batchId, mutations });
          };
        }),
    );
    const queued = addToQueue({
      sender: "gone@example.com",
      emailAccountId: "account-1",
    });
    await Promise.resolve();
    expect(releaseEnqueue).toBeDefined();
    clearStatuses("account-1");
    releaseEnqueue?.();
    await expect(queued).resolves.toBe(false);

    expect(storedAccountKeys(storageKey)).toEqual(
      new Set(["account-2:keep@example.com"]),
    );
  });

  it("still persists later queues after one account is cleared", async () => {
    installMemorySessionStorage();
    mockFetchAllSenderThreads.mockResolvedValue({
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
    });
    const { createSenderQueue } = await import("./sender-queue");
    const { addToQueue, clearStatuses } = createSenderQueue(() => ({
      kind: "trash",
    }));
    const storageKey = `inbox-zero:sender-queue:${JSON.stringify({ kind: "trash" })}`;

    await addToQueue({
      sender: "one@example.com",
      emailAccountId: "account-1",
    });
    await addToQueue({
      sender: "two@example.com",
      emailAccountId: "account-2",
    });
    clearStatuses("account-1");
    await addToQueue({
      sender: "three@example.com",
      emailAccountId: "account-2",
    });

    expect(storedAccountKeys(storageKey)).toEqual(
      new Set(["account-2:two@example.com", "account-2:three@example.com"]),
    );
  });
});

function storedAccountKeys(storageKey: string) {
  const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as {
    durable?: Array<[string, unknown]>;
    progress?: Array<[string, unknown]>;
    transient?: Array<[string, unknown]>;
  };
  return new Set(
    [stored.durable, stored.progress, stored.transient]
      .flatMap((entries) => entries ?? [])
      .map(([queueKey]) => queueKey),
  );
}

function installMemorySessionStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal("sessionStorage", {
    get length() {
      return Object.keys(store).length;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    getItem(key: string) {
      return Object.hasOwn(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
  } satisfies Storage);
}
