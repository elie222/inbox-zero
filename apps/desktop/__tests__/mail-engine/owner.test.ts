import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesktopMailOwner } from "../../src/mail-engine/owner";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";

describe("desktop mail owner", () => {
  it("shares one engine across window IPC clients and recovers after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-owner-"));
    const owner = await createDesktopMailOwner({
      databasePath: join(directory, "mailbox.sqlite"),
      source: emptySource(),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
    });
    const first = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "w1",
      method: "submitMetadata",
      payload: {
        accountId: "acc-1",
        commandId: "archive-shared",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "archive" },
      },
    });
    const second = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "w2",
      method: "submitMetadata",
      payload: {
        accountId: "acc-1",
        commandId: "archive-shared",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "archive" },
      },
    });
    expect(first).toMatchObject({
      status: "ok",
      result: { status: "queued" },
    });
    expect(second).toMatchObject({
      status: "ok",
      result: { status: "already_recorded" },
    });
    await owner.recover();
    const recovered = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "w3",
      method: "submitMetadata",
      payload: {
        accountId: "acc-1",
        commandId: "archive-shared",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "archive" },
      },
    });
    expect(recovered).toMatchObject({
      status: "ok",
      result: { status: "already_recorded" },
    });
    await owner.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("pushes changed snapshots to subscribers, across recovery, until unsubscribed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-owner-push-"));
    const owner = await createDesktopMailOwner({
      databasePath: join(directory, "mailbox.sqlite"),
      source: emptySource(),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
    });
    const pushed: Array<{ data?: { status?: string } }> = [];
    const unsubscribe = owner.subscribe(
      {
        protocolVersion: 1,
        requestId: "sub",
        method: "observeOperation",
        payload: { accountId: "acc-1", operationId: "archive-push" },
      },
      (snapshot) => pushed.push(snapshot as { data?: { status?: string } }),
    );
    if (!unsubscribe) throw new Error("expected a subscription");
    await expect.poll(() => pushed.at(-1)?.data?.status).toBe("failed");

    const submit = (requestId: string, commandId: string) =>
      owner.handleIpc({
        protocolVersion: 1,
        requestId,
        method: "submitMetadata",
        payload: {
          accountId: "acc-1",
          commandId,
          targets: [{ accountId: "acc-1", messageId: "m1" }],
          change: { kind: "archive" },
        },
      });
    await submit("w1", "archive-push");
    await expect.poll(() => pushed.at(-1)?.data?.status).toBe("queued");

    await owner.recover();
    const afterRecovery = pushed.length;
    await expect.poll(() => pushed.length).toBeGreaterThan(afterRecovery);

    unsubscribe();
    const afterUnsubscribe = pushed.length;
    await submit("w2", "archive-other");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pushed).toHaveLength(afterUnsubscribe);

    expect(
      owner.subscribe({ method: "submitMetadata" }, () => undefined),
    ).toBeNull();
    await owner.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("returns mailbox snapshots over validated IPC", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-owner-view-"));
    const owner = await createDesktopMailOwner({
      databasePath: join(directory, "mailbox.sqlite"),
      source: emptySource(),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
    });
    const snapshot = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "obs",
      method: "observeMailbox",
      payload: {
        accountIds: ["acc-1"],
        predicate: { kind: "role", role: "inbox" },
        order: "newest_first",
        pageSize: 25,
        after: null,
      },
    });
    expect(snapshot).toMatchObject({
      status: "ok",
      result: { status: "ready" },
    });
    const counts = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "counts",
      method: "observeMailboxCounts",
      payload: {
        accountIds: ["acc-1"],
        targets: [
          { id: "INBOX", predicate: { kind: "role", role: "inbox" } },
          {
            id: "Label_1",
            predicate: { kind: "membership", membership: "label", id: "L1" },
          },
        ],
      },
    });
    expect(counts).toMatchObject({
      status: "ok",
      result: {
        status: "ready",
        data: {
          counts: [
            { id: "INBOX", matchingConversations: 0, unreadConversations: 0 },
            { id: "Label_1", matchingConversations: 0, unreadConversations: 0 },
          ],
        },
      },
    });
    const inspected = await owner.handleIpc({
      protocolVersion: 1,
      requestId: "inspect",
      method: "inspect",
      payload: {},
    });
    expect(inspected).toMatchObject({
      status: "ok",
      result: { revision: expect.anything(), accounts: expect.any(Array) },
    });
    await owner.close();
    await rm(directory, { recursive: true, force: true });
  });
});

function emptySource(): MailboxSource {
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 10,
          maxHydrationBatch: 10,
        },
      };
    },
    async discoverScopes() {
      return { status: "ok", value: { scopes: [], nextPage: null } };
    },
    async beginBootstrap() {
      return {
        status: "ok",
        value: { bootstrapId: "x", enumerationToken: "{}", catchUpFrom: null },
      };
    },
    async enumerate() {
      return { status: "reset_required", scopeId: "primary" };
    },
    async readChanges() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readConversationMembership() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
}
