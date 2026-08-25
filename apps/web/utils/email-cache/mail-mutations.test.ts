// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  cancelPendingMailMutation,
  claimMailMutationNotification,
  claimNextMailMutationNotification,
  claimNextMailMutation,
  enqueueMailMutation,
  getActiveMailMutations,
  getMailMutation,
  getNextMailMutationWakeAt,
  completeMailMutation,
  failMailMutation,
  retryMailMutation,
  blockMailMutationForAuth,
  renewMailMutationLease,
  resumeBlockedMailMutations,
} from "./mail-mutations";

describe("mail mutation outbox", () => {
  beforeEach(clearEmailCache);

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
