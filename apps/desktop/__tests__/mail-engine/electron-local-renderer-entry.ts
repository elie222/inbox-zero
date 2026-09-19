import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createDesktopMailOwner } from "../../src/mail-engine/owner";
import { createDesktopMailStore } from "../../src/mail-engine/sqlite";

app.whenReady().then(() =>
  runSmoke().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    app.exit(1);
  }),
);

async function runSmoke() {
  const directory = process.env.ELECTRON_MAILBOX_DIR
    ? process.env.ELECTRON_MAILBOX_DIR
    : await mkdtemp(join(tmpdir(), "electron-local-mail-"));
  const databasePath = join(directory, "mailbox.sqlite");
  if (process.env.ELECTRON_SKIP_SEED !== "1") {
    await seedMailbox(databasePath);
  }
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
  const expectedSubjects = process.env.ELECTRON_EXPECTED_SUBJECTS
    ? process.env.ELECTRON_EXPECTED_SUBJECTS.split("|")
    : ["Local Mail Example"];
  try {
    await window.loadFile(renderer, { query: { accountId: "acc-1" } });
    const subjects = await waitForSubjects(window, expectedSubjects);
    if (process.env.ELECTRON_SKIP_ARCHIVE !== "1") {
      const archiveSubject =
        process.env.ELECTRON_ARCHIVE_SUBJECT ?? "Local Mail Example";
      await clickArchive(window, archiveSubject);
      await waitForMissingSubject(window, archiveSubject);
    }
    const inboxCount = await waitForInboxCount(
      owner,
      Number(process.env.ELECTRON_EXPECTED_INBOX ?? "0"),
    );
    process.stdout.write(
      `ELECTRON_LOCAL_MAIL ${JSON.stringify({
        electron: process.versions.electron,
        url: window.webContents.getURL(),
        subjects,
        inboxAfterArchive: inboxCount,
        inboxCount,
      })}\n`,
    );
  } finally {
    await owner.close();
    app.quit();
  }
}

async function seedMailbox(databasePath: string) {
  const staySubject = process.env.ELECTRON_STAY_SUBJECT;
  const archiveSubject =
    process.env.ELECTRON_ARCHIVE_SUBJECT ?? "Local Mail Example";
  const changes = [
    inboxMessage({
      messageId: "m-local",
      conversationId: "c-local",
      subject: archiveSubject,
      receivedAtMs: 1000,
    }),
  ];
  if (staySubject) {
    changes.push(
      inboxMessage({
        messageId: "m-stay",
        conversationId: "c-stay",
        subject: staySubject,
        receivedAtMs: 2000,
      }),
    );
  }
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
      changes,
      requiredHydration: [],
      roundComplete: true,
    },
    ownerId: "desktop-owner",
  });
  await store.close();
}

async function waitForSubjects(window: BrowserWindow, expected: string[]) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const subjects = await readSubjects(window);
    if (expected.every((subject) => subjects.includes(subject))) {
      return subjects;
    }
    await delay(250);
  }
  throw new Error("local mail renderer did not show the seeded conversation");
}

async function waitForMissingSubject(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const subjects = await readSubjects(window);
    if (!subjects.includes(subject)) return;
    await delay(250);
  }
  throw new Error(`${subject} remained in the local inbox`);
}

async function clickArchive(window: BrowserWindow, subject: string) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll("ul[aria-label='Conversations'] li")]
        .find((item) => item.textContent.includes(${JSON.stringify(subject)}));
      const button = [...(row?.querySelectorAll("button") ?? [])]
        .find((item) => item.textContent === "Archive");
      button?.click();
      return Boolean(button);
    })()
  `)) as boolean;
  if (!clicked) throw new Error(`Archive control missing for ${subject}`);
}

async function readSubjects(window: BrowserWindow) {
  return (await window.webContents.executeJavaScript(`
    [...document.querySelectorAll("ul[aria-label='Conversations'] li button:first-of-type")]
      .map((button) => button.textContent)
  `)) as string[];
}

async function waitForInboxCount(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  expected: number,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await readInboxCount(owner);
    if (count === expected) return count;
    await delay(250);
  }
  throw new Error(`inbox count did not become ${expected}`);
}

async function readInboxCount(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
) {
  const snapshot = (await owner.handleIpc({
    protocolVersion: 1,
    requestId: "obs-count",
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
  return snapshot.result?.data?.counts?.matchingConversations ?? -1;
}

function inboxMessage(input: {
  messageId: string;
  conversationId: string;
  subject: string;
  receivedAtMs: number;
}): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId: input.messageId },
    reference: {
      provider: "google",
      messageId: input.messageId,
      conversationId: input.conversationId,
      version: "1",
    },
    fields: {
      subject: input.subject,
      preview: "Seeded for offline desktop boot",
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: input.receivedAtMs,
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
  const members: Record<string, string> = {
    "c-local": "m-local",
    "c-stay": "m-stay",
  };
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
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readChanges() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readConversationMembership({ conversation }) {
      const messageId = members[conversation.conversationId];
      if (conversation.accountId !== "acc-1" || !messageId) {
        return { status: "ok", value: { status: "not_found" } };
      }
      return {
        status: "ok",
        value: {
          status: "page",
          page: {
            conversation,
            resolutionId: `res-${conversation.conversationId}`,
            keys: [{ accountId: "acc-1", messageId }],
            changes: [],
            nextPage: null,
            evidence: null,
          },
        },
      };
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
