import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createDesktopMailOwner } from "../../src/mail-engine/owner";
import { createDesktopMailStore } from "../../src/mail-engine/sqlite";

app.whenReady().then(runSmoke);

async function runSmoke() {
  const directory = await mkdtemp(join(tmpdir(), "electron-local-mail-"));
  const databasePath = join(directory, "mailbox.sqlite");
  await seedMailbox(databasePath);
  const owner = await createDesktopMailOwner({
    databasePath,
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
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: requiredEnv("ELECTRON_PRELOAD"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  ipcMain.handle(
    "mail-engine",
    (_event: IpcMainInvokeEvent, payload: unknown) => owner.handleIpc(payload),
  );
  const renderer = requiredEnv("ELECTRON_RENDERER_HTML");
  await window.loadFile(renderer, { query: { accountId: "acc-1" } });
  const subjects = await waitForSubjects(window);
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll("ul[aria-label='Conversations'] button")]
      .find((button) => button.textContent === "Archive")
      ?.click();
  `);
  const afterArchive = await waitForEmptyInbox(owner);
  process.stdout.write(
    `ELECTRON_LOCAL_MAIL ${JSON.stringify({
      electron: process.versions.electron,
      url: window.webContents.getURL(),
      subjects,
      inboxAfterArchive: afterArchive,
    })}\n`,
  );
  await owner.close();
  app.quit();
}

async function seedMailbox(databasePath: string) {
  const store = await createDesktopMailStore(databasePath);
  await store.ensureAccount({
    accountId: "acc-1",
    provider: "google",
    generation: "g1",
  });
  await store.applySyncPage({
    page: {
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "seed",
      from: {
        accountId: "acc-1",
        streamId: "primary",
        generation: "g1",
        checkpoint: null,
      },
      to: {
        accountId: "acc-1",
        streamId: "primary",
        generation: "g1",
        checkpoint: "local",
      },
      changes: [inboxMessage()],
      requiredHydration: [],
      roundComplete: true,
    },
    ownerId: "desktop-owner",
  });
  await store.close();
}

async function waitForSubjects(window: BrowserWindow) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const subjects = (await window.webContents.executeJavaScript(`
      [...document.querySelectorAll("ul[aria-label='Conversations'] li button:first-of-type")]
        .map((button) => button.textContent)
    `)) as string[];
    if (subjects.includes("Local Mail Example")) return subjects;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local mail renderer did not show the seeded conversation");
}

async function waitForEmptyInbox(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = (await owner.handleIpc({
      protocolVersion: 1,
      requestId: `obs-${attempt}`,
      method: "observeMailbox",
      payload: {
        accountIds: ["acc-1"],
        predicate: { kind: "role", role: "inbox" },
        order: "newest_first",
        pageSize: 25,
        after: null,
      },
    })) as {
      result?: { data?: { counts?: { matchingConversations?: number } } };
    };
    if (snapshot.result?.data?.counts?.matchingConversations === 0) {
      return snapshot.result.data.counts.matchingConversations;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("archived conversation remained in the local inbox");
}

function inboxMessage(): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId: "m-local" },
    reference: {
      provider: "google",
      messageId: "m-local",
      conversationId: "c-local",
      version: "1",
    },
    fields: {
      subject: "Local Mail Example",
      preview: "Seeded for offline desktop boot",
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: 1000,
      read: false,
      starred: false,
      folderId: "inbox",
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
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

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
