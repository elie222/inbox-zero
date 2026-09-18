import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import { createDesktopMailOwner } from "../../src/mail-engine/owner";

app.whenReady().then(runSmoke);

async function runSmoke() {
  const directory = await mkdtemp(join(tmpdir(), "electron-mail-session-"));
  const owner = await createDesktopMailOwner({
    databasePath: join(directory, "mailbox.sqlite"),
    source: emptySource(),
    executor: uncertainExecutor(),
  });
  const admitted = await owner.handleIpc({
    protocolVersion: 1,
    requestId: "electron-archive",
    method: "submitMetadata",
    payload: {
      accountId: "acc-1",
      commandId: "archive-electron",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    },
  });
  const diagnostics = await owner.handleIpc({
    protocolVersion: 1,
    requestId: "electron-diagnostics",
    method: "getDiagnostics",
    payload: { accountId: "acc-1" },
  });
  process.stdout.write(
    `ELECTRON_MAIL_SMOKE ${JSON.stringify({
      electron: process.versions.electron,
      admitted,
      diagnostics,
    })}\n`,
  );
  await owner.close();
  app.quit();
}

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

function uncertainExecutor(): OperationExecutor {
  return {
    async execute() {
      return { status: "uncertain", receiptId: null };
    },
    async inspect() {
      return { status: "uncertain", receiptId: null };
    },
  };
}
