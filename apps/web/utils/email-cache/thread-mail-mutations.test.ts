// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache } from "./database";
import { getActiveMailMutations } from "./mail-mutations";
import { enqueueThreadMailMutationBatch } from "./thread-mail-mutations";

describe("thread mail mutation batches", () => {
  beforeEach(clearEmailCache);

  it("persists immutable thread message snapshots in one shared batch", async () => {
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
      },
      {
        batchId: result.batchId,
        clientSource: { kind: "sender", sender: "news@example.com" },
        emailAccountId: "account",
        threadId: "thread-2",
        messageIds: ["message-3"],
        labelId: "label",
      },
    ]);
  });

  it("rejects an incomplete snapshot before persisting any thread", async () => {
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

    await expect(getActiveMailMutations()).resolves.toEqual([]);
  });

  it("returns an empty durable batch without opening a partial write", async () => {
    const result = await enqueueThreadMailMutationBatch({
      batchId: "empty-batch",
      emailAccountId: "account",
      threads: [],
      payload: { kind: "archive" },
    });

    expect(result).toEqual({ batchId: "empty-batch", mutations: [] });
    await expect(getActiveMailMutations()).resolves.toEqual([]);
  });
});
