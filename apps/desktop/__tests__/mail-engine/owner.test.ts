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
