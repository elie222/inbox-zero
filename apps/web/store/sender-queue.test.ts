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
});
