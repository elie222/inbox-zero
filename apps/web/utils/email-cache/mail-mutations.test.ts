// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  cancelPendingMailMutation,
  claimMailMutationNotification,
  claimNextMailMutationNotification,
  claimNextMailMutation,
  claimNextMailMutationSyncGroup,
  enqueueMailMutation,
  enqueueMailMutationBatch,
  getActiveMailMutations,
  getMailMutation,
  getMailMutations,
  getMailMutationsForAccount,
  getNextMailMutationWakeAt,
  isActiveMailMutationStatus,
  completeMailMutation,
  completeMailMutationSyncGroup,
  failMailMutation,
  markMailMutationAwaitingSync,
  retryMailMutation,
  retryMailMutationSyncGroup,
  blockMailMutationForAuth,
  renewMailMutationLease,
  renewMailMutationSyncGroupLease,
  resumeBlockedMailMutations,
  subscribeToMailMutations,
} from "./mail-mutations";

describe("mail mutation outbox", () => {
  beforeEach(clearEmailCache);

  it("classifies every durable nonterminal status as active", () => {
    for (const status of [
      "pending",
      "processing",
      "retry_wait",
      "blocked_auth",
      "awaiting_sync",
      "reconciling",
    ] as const) {
      expect(isActiveMailMutationStatus(status)).toBe(true);
    }
    for (const status of ["succeeded", "failed", "uncertain"] as const) {
      expect(isActiveMailMutationStatus(status)).toBe(false);
    }
  });

  it("atomically persists exact account snapshots under one batch", async () => {
    const mutations = await enqueueMailMutationBatch(
      [
        {
          id: "account-1-archive",
          emailAccountId: "account-1",
          threadId: "shared-thread",
          messageIds: ["message-1", "message-1", "message-2"],
          kind: "archive",
          labelId: "label-1",
        },
        {
          id: "account-2-archive",
          emailAccountId: "account-2",
          threadId: "shared-thread",
          messageIds: ["message-3"],
          kind: "archive",
        },
      ],
      10,
    );

    expect(mutations).toMatchObject([
      {
        id: "account-1-archive",
        emailAccountId: "account-1",
        messageIds: ["message-1", "message-2"],
        labelId: "label-1",
      },
      {
        id: "account-2-archive",
        emailAccountId: "account-2",
        messageIds: ["message-3"],
      },
    ]);
    expect(mutations[0]?.batchId).toBe(mutations[1]?.batchId);
    await expect(getActiveMailMutations()).resolves.toHaveLength(2);
  });

  it("announces newly persisted mutations to live overlays", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMailMutations(listener);

    try {
      const mutation = await enqueueMailMutation({
        id: "announced",
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["message-1"],
        kind: "archive",
      });

      expect(listener).toHaveBeenCalledWith([mutation]);
    } finally {
      unsubscribe();
    }
  });

  it("persists client sender metadata on every mutation in a batch", async () => {
    await enqueueMailMutationBatch(
      [
        {
          id: "sender-thread-1",
          batchId: "sender-batch",
          clientSource: { kind: "sender", sender: "news@example.com" },
          emailAccountId: "account",
          threadId: "thread-1",
          messageIds: ["message-1"],
          kind: "archive",
        },
        {
          id: "sender-thread-2",
          batchId: "sender-batch",
          clientSource: { kind: "sender", sender: "news@example.com" },
          emailAccountId: "account",
          threadId: "thread-2",
          messageIds: ["message-2"],
          kind: "archive",
        },
      ],
      10,
    );

    await expect(getMailMutationsForAccount("account")).resolves.toMatchObject([
      {
        id: "sender-thread-1",
        clientSource: { kind: "sender", sender: "news@example.com" },
      },
      {
        id: "sender-thread-2",
        clientSource: { kind: "sender", sender: "news@example.com" },
      },
    ]);
  });

  it("returns retained terminal mutations by account in latest-batch order", async () => {
    await enqueueMailMutation(
      {
        id: "old",
        batchId: "old-batch",
        clientSource: { kind: "sender", sender: "news@example.com" },
        emailAccountId: "account-1",
        threadId: "thread-old",
        messageIds: ["message-old"],
        kind: "archive",
      },
      10,
    );
    await completeMailMutation("old");
    await enqueueMailMutationBatch(
      [
        {
          id: "new-1",
          batchId: "new-batch",
          clientSource: { kind: "sender", sender: "news@example.com" },
          emailAccountId: "account-1",
          threadId: "thread-new-1",
          messageIds: ["message-new-1"],
          kind: "archive",
        },
        {
          id: "new-2",
          batchId: "new-batch",
          clientSource: { kind: "sender", sender: "news@example.com" },
          emailAccountId: "account-1",
          threadId: "thread-new-2",
          messageIds: ["message-new-2"],
          kind: "archive",
        },
      ],
      20,
    );
    await failMailMutation("new-1", "failed", "Rejected");
    await enqueueMailMutation(
      {
        id: "other-account",
        clientSource: { kind: "sender", sender: "news@example.com" },
        emailAccountId: "account-2",
        threadId: "thread-other",
        messageIds: ["message-other"],
        kind: "archive",
      },
      30,
    );

    const mutations = await getMailMutationsForAccount("account-1");

    expect(mutations).toMatchObject([
      {
        id: "old",
        batchId: "old-batch",
        clientSource: { kind: "sender", sender: "news@example.com" },
        status: "succeeded",
      },
      { id: "new-1", batchId: "new-batch", status: "failed" },
      { id: "new-2", batchId: "new-batch", status: "pending" },
    ]);
    expect(
      mutations.every((mutation) => mutation.emailAccountId === "account-1"),
    ).toBe(true);
    expect(mutations.slice(-2).map((mutation) => mutation.batchId)).toEqual([
      "new-batch",
      "new-batch",
    ]);
  });

  it("rolls back every write when any mutation in a batch fails", async () => {
    await expect(
      enqueueMailMutationBatch(
        [
          {
            id: "duplicate-id",
            emailAccountId: "account-1",
            threadId: "thread-1",
            messageIds: ["message-1"],
            kind: "archive",
          },
          {
            id: "duplicate-id",
            emailAccountId: "account-2",
            threadId: "thread-2",
            messageIds: ["message-2"],
            kind: "trash",
          },
        ],
        10,
      ),
    ).rejects.toBeDefined();

    await expect(getActiveMailMutations()).resolves.toEqual([]);
  });

  it("coalesces read state changes inside the atomic batch", async () => {
    await enqueueMailMutation(
      {
        id: "existing-read",
        batchId: "old-batch",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["old-message"],
        kind: "set_read_state",
        read: true,
      },
      10,
    );

    const [mutation] = await enqueueMailMutationBatch(
      [
        {
          batchId: "new-batch",
          clientSource: { kind: "sender", sender: "news@example.com" },
          emailAccountId: "account",
          threadId: "thread",
          messageIds: ["new-message"],
          kind: "set_read_state",
          read: false,
        },
      ],
      20,
    );

    expect(mutation).toMatchObject({
      id: "existing-read",
      batchId: "new-batch",
      clientSource: { kind: "sender", sender: "news@example.com" },
      createdAt: 20,
      messageIds: ["new-message"],
      read: false,
    });
    await expect(getActiveMailMutations()).resolves.toHaveLength(1);
  });

  it("does not coalesce matching provider identities across accounts", async () => {
    await enqueueMailMutationBatch(
      ["account-1", "account-2"].map((emailAccountId) => ({
        emailAccountId,
        threadId: "shared-thread",
        messageIds: ["shared-message"],
        kind: "set_read_state" as const,
        read: true,
      })),
      10,
    );

    await expect(getActiveMailMutations()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAccountId: "account-1",
          threadId: "shared-thread",
        }),
        expect.objectContaining({
          emailAccountId: "account-2",
          threadId: "shared-thread",
        }),
      ]),
    );
  });

  it("persists immutable message snapshots and clears them per account", async () => {
    await enqueueMailMutation(
      {
        id: "mutation-1",
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["message-1", "message-1", "message-2"],
        kind: "archive",
      },
      10,
    );

    await expect(getActiveMailMutations("account-1")).resolves.toMatchObject([
      {
        id: "mutation-1",
        messageIds: ["message-1", "message-2"],
        status: "pending",
      },
    ]);

    const database = await getEmailCacheDatabase();
    expect(database?.objectStoreNames.contains("mailMutations")).toBe(true);
  });

  it("coalesces unleased read state changes with last-write-wins semantics", async () => {
    await enqueueMailMutation(
      {
        id: "read-1",
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["message-1"],
        kind: "set_read_state",
        read: true,
      },
      10,
    );
    const result = await enqueueMailMutation(
      {
        id: "read-2",
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageIds: ["message-1", "message-2"],
        kind: "set_read_state",
        read: false,
      },
      20,
    );

    expect(result).toMatchObject({ id: "read-1", read: false });
    await expect(getActiveMailMutations()).resolves.toHaveLength(1);
  });

  it("leases different threads while preserving FIFO within one thread", async () => {
    await enqueueMailMutation(
      {
        id: "first",
        emailAccountId: "account",
        threadId: "same",
        messageIds: ["one"],
        kind: "archive",
      },
      10,
    );
    await enqueueMailMutation(
      {
        id: "second",
        emailAccountId: "account",
        threadId: "same",
        messageIds: ["one"],
        kind: "set_read_state",
        read: true,
      },
      20,
    );
    await enqueueMailMutation(
      {
        id: "other",
        emailAccountId: "account",
        threadId: "other",
        messageIds: ["two"],
        kind: "trash",
      },
      30,
    );

    expect(
      await claimNextMailMutation({ ownerId: "worker", leaseMs: 100, now: 40 }),
    ).toMatchObject({ id: "first", attempts: 1 });
    expect(
      await claimNextMailMutation({ ownerId: "worker", leaseMs: 100, now: 40 }),
    ).toMatchObject({ id: "other" });
  });

  it("reclaims an expired reply lease so the server send operation decides the outcome", async () => {
    await enqueueMailMutation(
      {
        id: "reply",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "reply",
        email: { to: "to@example.com", subject: "Hi", messageHtml: "Hi" },
      },
      10,
    );
    await claimNextMailMutation({ ownerId: "worker-1", leaseMs: 10, now: 10 });

    await expect(
      claimNextMailMutation({ ownerId: "worker-2", leaseMs: 10, now: 21 }),
    ).resolves.toMatchObject({ id: "reply", attempts: 2 });
  });

  it("renews a processing lease only for its current owner", async () => {
    await enqueueMailMutation(
      {
        id: "archive",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await claimNextMailMutation({ ownerId: "worker-1", leaseMs: 10, now: 10 });

    await expect(
      renewMailMutationLease("archive", {
        ownerId: "worker-2",
        leaseMs: 100,
        now: 15,
      }),
    ).resolves.toBe(false);
    await expect(
      renewMailMutationLease("archive", {
        ownerId: "worker-1",
        leaseMs: 100,
        now: 15,
      }),
    ).resolves.toBe(true);
    await expect(
      claimNextMailMutation({ ownerId: "worker-2", leaseMs: 10, now: 21 }),
    ).resolves.toBeUndefined();
    await expect(
      claimNextMailMutation({ ownerId: "worker-2", leaseMs: 10, now: 116 }),
    ).resolves.toMatchObject({ id: "archive", attempts: 2 });
  });

  it("does not let an expired lease owner overwrite the new owner", async () => {
    await enqueueMailMutation(
      {
        id: "archive",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await claimNextMailMutation({ ownerId: "worker-1", leaseMs: 10, now: 10 });
    await claimNextMailMutation({ ownerId: "worker-2", leaseMs: 100, now: 21 });

    await completeMailMutation("archive", undefined, "worker-1");
    await retryMailMutation(
      "archive",
      { error: "stale failure", nextAttemptAt: 30 },
      "worker-1",
    );

    await expect(getMailMutation("archive")).resolves.toMatchObject({
      leaseOwner: "worker-2",
      status: "processing",
    });

    await completeMailMutation("archive", undefined, "worker-2");
    await expect(getMailMutation("archive")).resolves.toMatchObject({
      leaseOwner: undefined,
      status: "succeeded",
    });
  });

  it("does not let later work pass an earlier retry for the same thread", async () => {
    await enqueueMailMutation(
      {
        id: "first",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await enqueueMailMutation(
      {
        id: "second",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "trash",
      },
      20,
    );
    await retryMailMutation("first", { error: "offline", nextAttemptAt: 100 });

    await expect(
      claimNextMailMutation({ ownerId: "worker", leaseMs: 10, now: 50 }),
    ).resolves.toBeUndefined();
    await expect(cancelPendingMailMutation("first")).resolves.toBe(true);
    expect(
      await claimNextMailMutation({ ownerId: "worker", leaseMs: 10, now: 50 }),
    ).toMatchObject({ id: "second" });
  });

  it("keeps a typed success settlement observable", async () => {
    await enqueueMailMutation(
      {
        id: "done",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );

    await completeMailMutation("done", {
      messageId: "sent-message",
      threadId: "sent-thread",
    });

    await expect(getActiveMailMutations()).resolves.toEqual([]);
    await expect(getMailMutation("done")).resolves.toMatchObject({
      id: "done",
      status: "succeeded",
      result: { messageId: "sent-message", threadId: "sent-thread" },
    });
  });

  it("claims reconciliation only after every provider mutation in the batch settles", async () => {
    await enqueueMailMutationBatch(
      [
        {
          id: "applied",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-1",
          messageIds: ["message-1"],
          kind: "archive",
        },
        {
          id: "pending",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-2",
          messageIds: ["message-2"],
          kind: "trash",
        },
      ],
      10,
    );
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 10 });
    await markMailMutationAwaitingSync(
      "applied",
      { provider: "applied" },
      "provider",
    );

    await expect(
      claimNextMailMutationSyncGroup({
        ownerId: "sync",
        leaseMs: 100,
        now: 20,
      }),
    ).resolves.toBeUndefined();

    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 20 });
    await failMailMutation(
      "pending",
      "failed",
      "Provider rejected",
      "provider",
    );

    await expect(
      claimNextMailMutationSyncGroup({
        ownerId: "sync",
        leaseMs: 100,
        now: 20,
      }),
    ).resolves.toMatchObject({
      batchId: "batch",
      emailAccountId: "account",
      mutations: [{ id: "applied", status: "reconciling" }],
    });
  });

  it("completes a claimed sync group while retaining terminal failures", async () => {
    await enqueueMailMutationBatch(
      [
        {
          id: "applied",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-1",
          messageIds: ["message-1"],
          kind: "archive",
        },
        {
          id: "failed",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-2",
          messageIds: ["message-2"],
          kind: "trash",
        },
      ],
      10,
    );
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 10 });
    await markMailMutationAwaitingSync("applied", undefined, "provider");
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 10 });
    await failMailMutation("failed", "failed", "Rejected", "provider");
    const group = await claimNextMailMutationSyncGroup({
      ownerId: "sync",
      leaseMs: 100,
      now: 20,
    });
    if (!group) throw new Error("Expected a claimed sync group");

    await expect(
      completeMailMutationSyncGroup(group, "sync"),
    ).resolves.toMatchObject([{ id: "applied", status: "succeeded" }]);
    await expect(
      getMailMutations(["applied", "failed", "missing"]),
    ).resolves.toMatchObject([
      { id: "applied", status: "succeeded" },
      { id: "failed", status: "failed" },
    ]);
  });

  it("retries reconciliation without replaying provider mutations", async () => {
    await enqueueMailMutation(
      {
        id: "applied",
        batchId: "batch",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 10 });
    await markMailMutationAwaitingSync("applied", undefined, "provider");
    const group = await claimNextMailMutationSyncGroup({
      ownerId: "sync-1",
      leaseMs: 10,
      now: 20,
    });
    if (!group) throw new Error("Expected a claimed sync group");
    expect(group).toMatchObject({
      mutations: [{ id: "applied", syncAttempts: 1 }],
    });
    await retryMailMutationSyncGroup(
      group,
      { error: "Sync failed", nextAttemptAt: 50 },
      "sync-1",
    );

    await expect(getActiveMailMutations()).resolves.toMatchObject([
      { id: "applied", status: "awaiting_sync", syncAttempts: 1 },
    ]);
    await expect(
      claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 60 }),
    ).resolves.toBeUndefined();
    await expect(
      claimNextMailMutationSyncGroup({
        ownerId: "sync-2",
        leaseMs: 10,
        now: 49,
      }),
    ).resolves.toBeUndefined();
    const retriedGroup = await claimNextMailMutationSyncGroup({
      ownerId: "sync-2",
      leaseMs: 10,
      now: 50,
    });
    expect(retriedGroup).toMatchObject({
      mutations: [{ id: "applied", syncAttempts: 2 }],
    });
    await expect(getActiveMailMutations()).resolves.toMatchObject([
      { id: "applied", status: "reconciling", syncAttempts: 2 },
    ]);
  });

  it("reclaims expired reconciliation leases after a restart", async () => {
    await enqueueMailMutation(
      {
        id: "applied",
        batchId: "batch",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 10 });
    await markMailMutationAwaitingSync("applied", undefined, "provider");
    await claimNextMailMutationSyncGroup({
      ownerId: "sync-1",
      leaseMs: 10,
      now: 20,
    });

    await expect(
      claimNextMailMutationSyncGroup({
        ownerId: "sync-2",
        leaseMs: 10,
        now: 29,
      }),
    ).resolves.toBeUndefined();
    await expect(
      claimNextMailMutationSyncGroup({
        ownerId: "sync-2",
        leaseMs: 10,
        now: 31,
      }),
    ).resolves.toMatchObject({
      mutations: [{ id: "applied", leaseOwner: "sync-2", syncAttempts: 2 }],
    });
  });

  it("renews every reconciliation lease only for the group owner", async () => {
    await enqueueMailMutationBatch(
      [
        {
          id: "first",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-1",
          messageIds: ["message-1"],
          kind: "archive",
        },
        {
          id: "second",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-2",
          messageIds: ["message-2"],
          kind: "trash",
        },
      ],
      10,
    );
    for (const id of ["first", "second"]) {
      await claimNextMailMutation({
        ownerId: "provider",
        leaseMs: 100,
        now: 10,
      });
      await markMailMutationAwaitingSync(id, undefined, "provider");
    }
    const group = await claimNextMailMutationSyncGroup({
      ownerId: "sync-1",
      leaseMs: 10,
      now: 20,
    });
    if (!group) throw new Error("Expected a claimed sync group");

    await expect(
      renewMailMutationSyncGroupLease(group, {
        ownerId: "sync-2",
        leaseMs: 100,
        now: 25,
      }),
    ).resolves.toBe(false);
    await expect(
      renewMailMutationSyncGroupLease(group, {
        ownerId: "sync-1",
        leaseMs: 100,
        now: 25,
      }),
    ).resolves.toBe(true);
    await expect(
      claimNextMailMutationSyncGroup({
        ownerId: "sync-2",
        leaseMs: 10,
        now: 31,
      }),
    ).resolves.toBeUndefined();
    await expect(getMailMutations(["first", "second"])).resolves.toMatchObject([
      { leaseExpiresAt: 125, leaseOwner: "sync-1" },
      { leaseExpiresAt: 125, leaseOwner: "sync-1" },
    ]);
  });

  it("resumes blocked authentication work after reconnection", async () => {
    await enqueueMailMutation(
      {
        id: "blocked",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await blockMailMutationForAuth("blocked", "Reconnect required");
    await expect(
      claimNextMailMutation({ ownerId: "worker", leaseMs: 10, now: 20 }),
    ).resolves.toBeUndefined();

    await expect(resumeBlockedMailMutations(30)).resolves.toBe(1);
    await expect(
      claimNextMailMutation({ ownerId: "worker", leaseMs: 10, now: 30 }),
    ).resolves.toMatchObject({ id: "blocked" });
  });

  it("allows undo to cancel blocked work that is not in flight", async () => {
    await enqueueMailMutation(
      {
        id: "blocked",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "trash",
      },
      10,
    );
    await blockMailMutationForAuth("blocked", "Reconnect required");

    await expect(cancelPendingMailMutation("blocked")).resolves.toBe(true);
    await expect(getMailMutation("blocked")).resolves.toBeUndefined();
  });

  it("reports the earliest retry wake time", async () => {
    for (const [id, now] of [
      ["later", 200],
      ["earlier", 100],
    ] as const) {
      await enqueueMailMutation(
        {
          id,
          emailAccountId: "account",
          threadId: id,
          messageIds: [id],
          kind: "archive",
        },
        now,
      );
      await retryMailMutation(id, { error: "offline", nextAttemptAt: now });
    }

    await expect(getNextMailMutationWakeAt()).resolves.toBe(100);
  });

  it("waits for the earliest per-thread blocker instead of spinning on later work", async () => {
    await enqueueMailMutation(
      {
        id: "leased",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await enqueueMailMutation(
      {
        id: "later",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "trash",
      },
      20,
    );
    await claimNextMailMutation({ ownerId: "worker", leaseMs: 200, now: 50 });

    await expect(getNextMailMutationWakeAt()).resolves.toBe(250);
  });

  it("does not spin on awaiting sync while its batch has a delayed provider retry", async () => {
    await enqueueMailMutationBatch(
      [
        {
          id: "applied",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-1",
          messageIds: ["message-1"],
          kind: "archive",
        },
        {
          id: "retrying",
          batchId: "batch",
          emailAccountId: "account",
          threadId: "thread-2",
          messageIds: ["message-2"],
          kind: "trash",
        },
      ],
      10,
    );
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 10 });
    await markMailMutationAwaitingSync("applied", undefined, "provider");
    await claimNextMailMutation({ ownerId: "provider", leaseMs: 100, now: 20 });
    await retryMailMutation(
      "retrying",
      { error: "Offline", nextAttemptAt: 100 },
      "provider",
    );

    await expect(getNextMailMutationWakeAt()).resolves.toBe(100);
  });

  it("claims a terminal notification once across manager restarts", async () => {
    await enqueueMailMutation(
      {
        id: "uncertain",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "reply",
        email: { to: "to@example.com", subject: "Hi", messageHtml: "Hi" },
      },
      10,
    );
    await failMailMutation("uncertain", "uncertain", "Unknown delivery");

    await expect(claimNextMailMutationNotification(20)).resolves.toMatchObject({
      id: "uncertain",
      status: "uncertain",
    });
    await expect(
      claimNextMailMutationNotification(30),
    ).resolves.toBeUndefined();
    await expect(getMailMutation("uncertain")).resolves.toMatchObject({
      notificationShownAt: 20,
    });
  });

  it("atomically claims a specific terminal notification", async () => {
    await enqueueMailMutation(
      {
        id: "failed",
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["message"],
        kind: "archive",
      },
      10,
    );
    await failMailMutation("failed", "failed", "Provider rejected mutation");

    const claims = await Promise.all([
      claimMailMutationNotification("failed", 20),
      claimMailMutationNotification("failed", 30),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({
      id: "failed",
      status: "failed",
    });
  });
});
