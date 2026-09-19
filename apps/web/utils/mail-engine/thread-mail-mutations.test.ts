import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueThreadMailMutationBatch } from "./thread-mail-mutations";
import { admissionRejectionCopy } from "./admission-notice";

const mail = vi.hoisted(() => ({
  current: null as null | {
    getDiagnostics: ReturnType<typeof vi.fn>;
    submitConversations: ReturnType<typeof vi.fn>;
  },
  client: {
    getDiagnostics: vi.fn(),
    submitConversations: vi.fn(),
  },
}));

vi.mock("@/utils/mail-engine/active-client", () => ({
  getActiveMailClient: () => mail.current,
}));

describe("thread mail mutation batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mail.current = mail.client;
    mail.client.getDiagnostics.mockResolvedValue({ revision: 1 });
    mail.client.submitConversations.mockResolvedValue({ status: "queued" });
  });

  it("submits each complete thread snapshot through the engine", async () => {
    const result = await enqueueThreadMailMutationBatch(
      {
        clientSource: { kind: "sender", sender: "news@example.com" },
        emailAccountId: "account",
        threads: [
          {
            id: "thread-1",
            messages: [
              { id: "message-1" },
              { id: "message-1" },
              { id: "message-2" },
            ],
          },
          { id: "thread-2", messages: [{ id: "message-3" }] },
        ],
        payload: { kind: "archive", labelId: "label" },
      },
      10,
    );

    expect(result.mutations).toMatchObject([
      {
        batchId: result.batchId,
        clientSource: { kind: "sender", sender: "news@example.com" },
        emailAccountId: "account",
        threadId: "thread-1",
        messageIds: ["message-1", "message-2"],
        labelId: "label",
        status: "succeeded",
      },
      {
        batchId: result.batchId,
        clientSource: { kind: "sender", sender: "news@example.com" },
        emailAccountId: "account",
        threadId: "thread-2",
        messageIds: ["message-3"],
        labelId: "label",
        status: "succeeded",
      },
    ]);
    expect(mail.client.submitConversations).toHaveBeenCalledTimes(2);
  });

  it("waits until the mail engine is published", async () => {
    mail.current = null;
    const pending = enqueueThreadMailMutationBatch({
      emailAccountId: "account",
      threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
      payload: { kind: "archive" },
    });
    queueMicrotask(() => {
      mail.current = mail.client;
    });
    await pending;
    expect(mail.client.submitConversations).toHaveBeenCalledTimes(1);
  });

  it("rejects an incomplete snapshot before submitting any thread", async () => {
    await expect(
      enqueueThreadMailMutationBatch({
        emailAccountId: "account",
        threads: [
          { id: "valid-thread", messages: [{ id: "message" }] },
          { id: "empty-thread", messages: [] },
        ],
        payload: { kind: "trash" },
      }),
    ).rejects.toThrow("empty-thread");
    expect(mail.client.submitConversations).not.toHaveBeenCalled();
  });

  it("returns an empty durable batch without contacting the engine", async () => {
    const result = await enqueueThreadMailMutationBatch({
      batchId: "empty-batch",
      emailAccountId: "account",
      threads: [],
      payload: { kind: "archive" },
    });

    expect(result).toEqual({ batchId: "empty-batch", mutations: [] });
    expect(mail.client.submitConversations).not.toHaveBeenCalled();
  });

  it("throws when the local command queue is full", async () => {
    mail.client.submitConversations.mockResolvedValue({
      status: "rejected",
      code: "queue_full",
    });
    await expect(
      enqueueThreadMailMutationBatch({
        emailAccountId: "account",
        threads: [{ id: "thread-1", messages: [{ id: "message-1" }] }],
        payload: { kind: "archive" },
      }),
    ).rejects.toThrow(admissionRejectionCopy("queue_full"));
  });
});
