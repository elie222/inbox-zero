import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDesktopMailEngine } from "../../src/mail-engine/host";
import {
  dispatchMailIpc,
  parseMailIpcRequest,
} from "../../src/mail-engine/ipc";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";

describe("desktop mail engine", () => {
  it("recovers queued archive intent after reopening the native database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-mail-"));
    const databasePath = join(directory, "mailbox.sqlite");
    const source = emptySource();
    const executor: OperationExecutor = {
      async execute() {
        return { status: "uncertain", receiptId: null };
      },
      async inspect() {
        return { status: "uncertain", receiptId: null };
      },
    };
    const engine = await createDesktopMailEngine({
      databasePath,
      source,
      executor,
    });
    await engine.submitMetadata({
      accountId: "acc-1",
      commandId: "archive-1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    await engine.close();
    const reopened = await createDesktopMailEngine({
      databasePath,
      source,
      executor,
    });
    const handle = reopened.observeOperation({
      accountId: "acc-1",
      operationId: "archive-1",
    });
    const operation = await waitFor(
      () => handle.getSnapshot(),
      (snapshot) => snapshot.status === "ready",
    );
    expect(["queued", "uncertain", "executing", "retry_wait"]).toContain(
      operation.data?.status,
    );
    await reopened.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects invalid IPC payloads", () => {
    const parsed = parseMailIpcRequest({
      method: "rawSql",
      sql: "DROP TABLE messages",
    });
    expect(parsed.success).toBe(false);
  });

  it("dispatches validated metadata commands and ignores raw SQL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "desktop-mail-ipc-"));
    const engine = await createDesktopMailEngine({
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
    const invalid = await dispatchMailIpc(engine, {
      method: "rawSql",
      sql: "DROP TABLE messages",
    });
    expect(invalid.status).toBe("invalid");
    const admitted = await dispatchMailIpc(engine, {
      protocolVersion: 1,
      requestId: "r1",
      method: "submitMetadata",
      payload: {
        accountId: "acc-1",
        commandId: "archive-2",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "archive" },
      },
    });
    expect(admitted.status).toBe("ok");
    await engine.close();
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

async function waitFor<T>(
  read: () => T,
  match: (value: T) => boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = read();
    if (match(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return read();
}
