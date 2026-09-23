import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createDesktopMailOwner } from "../../src/mail-engine/owner";
import { registerMailEnginePushIpc } from "../../src/mail-engine/push-ipc";
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
      async execute({ operation }) {
        return confirmedOperation(operation);
      },
      async inspect({ operation }) {
        return confirmedOperation(operation);
      },
    },
  });
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: requiredEnv("ELECTRON_PRELOAD"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  let invalidRequests = 0;
  ipcMain.handle(
    "mail-engine",
    async (_event: IpcMainInvokeEvent, payload: unknown) => {
      const result = await owner.handleIpc(payload);
      if (result.status === "invalid") invalidRequests += 1;
      return result;
    },
  );
  registerMailEnginePushIpc({ ipcMain, getOwner: () => owner });
  const renderer = requiredEnv("ELECTRON_RENDERER_HTML");
  const expectedSubjects = process.env.ELECTRON_EXPECTED_SUBJECTS
    ? process.env.ELECTRON_EXPECTED_SUBJECTS.split("|")
    : ["Local Mail Example"];
  try {
    await window.loadFile(renderer, { query: { accountId: "acc-1" } });
    const subjects = await waitForSubjects(window, expectedSubjects);
    await openSubject(window, expectedSubjects[0] ?? subjects[0]);
    await waitForReaderBody(window);
    if (process.env.ELECTRON_LONG_THREAD === "1") {
      await clickReaderPage(window, "Next messages");
      await waitForReaderBody(
        window,
        "Hydrated desktop message body m-local-50",
      );
      await clickReaderPage(window, "Previous messages");
      await waitForReaderBody(window, "Hydrated desktop message body m-local");
    }
    if (process.env.ELECTRON_SCREENSHOT) {
      await openSubject(window, expectedSubjects[0] ?? subjects[0]);
      await waitForReaderSubject(
        window,
        expectedSubjects[0] ?? subjects[0] ?? "",
      );
      await assertSharedMailUiStyles(
        window,
        expectedSubjects[0] ?? subjects[0],
      );
      await window.webContents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      await writeFile(
        process.env.ELECTRON_SCREENSHOT,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
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
        invalidRequests,
      })}\n`,
    );
  } finally {
    await owner.close();
    app.quit();
  }
}

function confirmedOperation(operation: PreparedOperation) {
  return {
    status: "confirmed" as const,
    receiptId: `local-${operation.key.operationId}`,
    observations: [],
    targets:
      operation.intent.kind === "metadata"
        ? operation.intent.targets.map((key) => ({
            key,
            outcome: "applied" as const,
            code: null,
          }))
        : [],
  };
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
  if (process.env.ELECTRON_LONG_THREAD === "1") {
    for (let index = 1; index <= 50; index += 1) {
      changes.push(
        inboxMessage({
          messageId: `m-local-${index}`,
          conversationId: "c-local",
          subject: archiveSubject,
          receivedAtMs: 1000 + index,
        }),
      );
    }
  }
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
    generation: "acc-1",
  });
  await store.applySyncPage({
    page: {
      session: { accountId: "acc-1", generation: "acc-1" },
      requestId: "seed",
      from: {
        accountId: "acc-1",
        streamId: "primary",
        generation: "acc-1",
        checkpoint: null,
      },
      to: {
        accountId: "acc-1",
        streamId: "primary",
        generation: "acc-1",
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

async function openSubject(window: BrowserWindow, subject?: string) {
  if (!subject) throw new Error("No subject available to open");
  const opened = (await window.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll("[role='listbox'][aria-label='Conversations'] [role='option']")]
        .find((item) => item.textContent.includes(${JSON.stringify(subject)}));
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return Boolean(row);
    })()
  `)) as boolean;
  if (!opened) throw new Error(`Could not open ${subject}`);
}

async function waitForReaderSubject(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const readerSubject = (await window.webContents.executeJavaScript(`
      document.querySelector('[data-testid="thread-reader"] h1')?.textContent ?? ""
    `)) as string;
    if (readerSubject.includes(subject)) return;
    await delay(250);
  }
  throw new Error(`${subject} did not open in the local reader`);
}

async function waitForReaderBody(window: BrowserWindow, text?: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const loaded = await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('iframe[title="Email content preview"]')]
        .some(frame => {
          const body = frame.contentDocument?.body?.textContent?.trim();
          return ${text ? `body === ${JSON.stringify(text)}` : 'body?.startsWith("Hydrated desktop message body")'};
        })
    `);
    if (loaded) return;
    await delay(250);
  }
  throw new Error("Local reader did not hydrate the selected message body");
}

async function clickReaderPage(window: BrowserWindow, label: string) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('[data-testid="thread-reader"] button')].find(button => button.textContent === ${JSON.stringify(label)});
      button?.click();
      return Boolean(button);
    })()
  `);
  if (!clicked) throw new Error(`Missing reader page control: ${label}`);
}

async function assertSharedMailUiStyles(
  window: BrowserWindow,
  subject?: string,
) {
  if (!subject) throw new Error("No subject available for style validation");
  const computed = (await window.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll("[role='listbox'][aria-label='Conversations'] [role='option']")]
        .find((item) => item.textContent.includes(${JSON.stringify(subject)}));
      const subjectElement = row?.querySelector("[data-mail-thread-subject]");
      const reader = document.querySelector('[data-testid="thread-reader"]');
      const toolbar = reader?.querySelector('[aria-label="Thread actions"]');
      const rowStyle = row ? getComputedStyle(row) : null;
      const subjectStyle = subjectElement ? getComputedStyle(subjectElement) : null;
      const readerStyle = reader ? getComputedStyle(reader) : null;
      const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
      return {
        rowDisplay: rowStyle?.display ?? null,
        rowBorderBottomStyle: rowStyle?.borderBottomStyle ?? null,
        subjectOverflow: subjectStyle?.overflow ?? null,
        subjectTextOverflow: subjectStyle?.textOverflow ?? null,
        subjectWhiteSpace: subjectStyle?.whiteSpace ?? null,
        readerDisplay: readerStyle?.display ?? null,
        readerOverflowY: readerStyle?.overflowY ?? null,
        toolbarDisplay: toolbarStyle?.display ?? null,
      };
    })()
  `)) as Record<string, string | null>;

  const expected = {
    rowDisplay: "flex",
    rowBorderBottomStyle: "solid",
    subjectOverflow: "hidden",
    subjectTextOverflow: "ellipsis",
    subjectWhiteSpace: "nowrap",
    readerDisplay: "block",
    readerOverflowY: "auto",
    toolbarDisplay: "flex",
  };
  for (const [property, value] of Object.entries(expected)) {
    if (computed[property] !== value) {
      throw new Error(
        `Mail UI stylesheet missing ${property}=${value}; got ${computed[property] ?? "null"}`,
      );
    }
  }
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
      const row = [...document.querySelectorAll("[role='listbox'][aria-label='Conversations'] [role='option']")]
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
    [...document.querySelectorAll("[role='listbox'][aria-label='Conversations'] [role='option'] [data-mail-thread-subject]")]
      .map((subject) => subject.textContent)
  `)) as string[];
}

async function waitForInboxCount(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  expected: number,
) {
  let lastCount = -1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    lastCount = await readInboxCount(owner);
    if (lastCount === expected) return lastCount;
    await delay(250);
  }
  throw new Error(`inbox count did not become ${expected}; last=${lastCount}`);
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
    async hydrate({ keys }) {
      return {
        status: "ok",
        value: {
          changes: [],
          bodies: keys.map((key) => ({
            key,
            version: null,
            html: `<p>Hydrated desktop message body ${key.messageId}</p>`,
            text: null,
            attachments: [],
            isMeetingInvitation: false,
          })),
          unresolved: [],
        },
      };
    },
    async readConversationMembership({ conversation, resolutionId }) {
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
            resolutionId,
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
