// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, clearEmailCacheForAccount } from "./database";
import {
  enqueueMailMutationBatch,
  failMailMutation,
  retryMailMutation,
} from "./mail-mutations";
import { readMailQueueDiagnostics } from "./mail-queue-diagnostics";

describe("mail queue diagnostics", () => {
  beforeEach(clearEmailCache);
  afterEach(() => vi.restoreAllMocks());

  it("counts the whole account while reading only the displayed records", async () => {
    await enqueueMailMutationBatch(
      Array.from({ length: 200 }, (_, index) => ({
        id: `mutation-${index}`,
        emailAccountId: "account",
        threadId: `thread-${index}`,
        messageIds: [`message-${index}`, `second-message-${index}`],
        kind: "archive" as const,
      })),
      100,
    );
    await enqueueMailMutationBatch(
      [
        {
          id: "other",
          emailAccountId: "other-account",
          threadId: "other",
          messageIds: [],
          kind: "archive",
        },
      ],
      101,
    );
    const get = vi.spyOn(IDBObjectStore.prototype, "get");
    const snapshot = await readMailQueueDiagnostics({
      emailAccountId: "account",
      filter: "active",
      limit: 50,
    });
    expect(snapshot).toMatchObject({
      total: 200,
      matchingCount: 200,
      activeCount: 200,
      activeBatchCount: 1,
      activeMessageCount: 400,
      counts: { pending: 200 },
    });
    expect(snapshot.mutations).toHaveLength(50);
    expect(
      get.mock.contexts.filter(
        (store) =>
          store instanceof IDBObjectStore && store.name === "mailMutations",
      ),
    ).toHaveLength(50);
    expect(
      snapshot.mutations.every((mutation) => !("payload" in mutation)),
    ).toBe(true);
  });

  it("filters status and orders by creation time without losing summary counts", async () => {
    await enqueueMailMutationBatch(
      [
        {
          id: "old",
          emailAccountId: "account",
          threadId: "old",
          messageIds: [],
          kind: "archive",
        },
      ],
      100,
    );
    await enqueueMailMutationBatch(
      [
        {
          id: "new",
          emailAccountId: "account",
          threadId: "new",
          messageIds: ["new-message"],
          kind: "archive",
        },
      ],
      200,
    );
    await retryMailMutation("old", {
      error: "Provider unavailable",
      nextAttemptAt: 300,
    });
    const retry = await readMailQueueDiagnostics({
      emailAccountId: "account",
      filter: "retry_wait",
      limit: 50,
    });
    expect(retry).toMatchObject({
      total: 2,
      matchingCount: 1,
      activeCount: 2,
      activeBatchCount: 2,
      counts: { pending: 1, retry_wait: 1 },
    });
    expect(retry.mutations).toMatchObject([
      { id: "old", lastError: "Provider unavailable" },
    ]);
    const all = await readMailQueueDiagnostics({
      emailAccountId: "account",
      filter: "all",
      limit: 1,
    });
    expect(all.mutations.map((mutation) => mutation.id)).toEqual(["new"]);
    await failMailMutation("new", "failed", "Rejected");
    const active = await readMailQueueDiagnostics({
      emailAccountId: "account",
      filter: "active",
      limit: 50,
    });
    expect(active).toMatchObject({
      total: 2,
      activeCount: 1,
      matchingCount: 1,
      counts: { failed: 1, retry_wait: 1 },
    });
  });

  it("discards an in-flight snapshot when the account cache is cleared", async () => {
    await enqueueMailMutationBatch([
      {
        id: "old",
        emailAccountId: "account",
        threadId: "old",
        messageIds: ["message"],
        kind: "archive",
      },
    ]);
    const originalGet = IDBObjectStore.prototype.get;
    let clearing = Promise.resolve();
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(
      function (key) {
        const request = originalGet.call(this, key);
        if (this.name === "mailMutations")
          clearing = clearEmailCacheForAccount("account");
        return request;
      },
    );
    const snapshot = await readMailQueueDiagnostics({
      emailAccountId: "account",
      filter: "all",
      limit: 50,
    });
    expect(snapshot).toMatchObject({ mutations: [], total: 0, activeCount: 0 });
    await clearing;
  });
});
