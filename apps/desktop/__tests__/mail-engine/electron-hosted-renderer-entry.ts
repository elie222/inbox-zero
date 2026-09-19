import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import { createDesktopMailOwner } from "../../src/mail-engine/owner";
import { createRoutedBackendPorts } from "../../src/mail-engine/backend";
import { mailApiHeaders } from "../../src/mail-engine/request";
import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";

const PARTITION = "persist:inbox-zero";
const ARCHIVE_SUBJECT =
  process.env.ELECTRON_ARCHIVE_SUBJECT ?? "Archive Action Message";

if (process.env.ELECTRON_USER_DATA) {
  app.setPath("userData", process.env.ELECTRON_USER_DATA);
}
app.disableHardwareAcceleration();

app.whenReady().then(() =>
  runHostedMail().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    app.exit(1);
  }),
);

async function runHostedMail() {
  const appOrigin = getDesktopAppOrigin(requiredEnv("ELECTRON_APP_URL"));
  const accountId = requiredEnv("ELECTRON_ACCOUNT_ID");
  const sqlitePath = join(app.getPath("userData"), "mailbox.sqlite");
  await injectAppCookies(appOrigin, requiredEnv("ELECTRON_STORAGE_STATE"));
  const owner = await createDesktopMailOwner({
    databasePath: sqlitePath,
    ...createRoutedBackendPorts(createSessionRequest(appOrigin)),
  });
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: requiredEnv("ELECTRON_PRELOAD"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  ipcMain.handle(
    "mail-engine",
    (_event: IpcMainInvokeEvent, payload: unknown) => owner.handleIpc(payload),
  );
  const mailUrl = new URL(`/${accountId}/mail`, appOrigin).toString();
  try {
    await window.loadURL(mailUrl);
    const transport = await waitForTransport(window, "desktop-ipc");
    const subjectsBefore = await waitForSubject(window, ARCHIVE_SUBJECT);
    await clickArchive(window, ARCHIVE_SUBJECT);
    await waitForMissingSubject(window, ARCHIVE_SUBJECT);
    const subjectsAfter = await readSubjects(window);
    await captureWindow(window);
    const nativeSubjects = await readNativeInboxSubjects(owner, accountId);
    process.stdout.write(
      `ELECTRON_HOSTED_MAIL ${JSON.stringify({
        electron: process.versions.electron,
        url: window.webContents.getURL(),
        transport,
        sqlitePath,
        sqliteExists: existsSync(sqlitePath),
        subjectsBefore,
        subjectsAfter,
        nativeInboxHasArchiveSubject: nativeSubjects.includes(ARCHIVE_SUBJECT),
      })}\n`,
    );
  } finally {
    await owner.close();
    app.quit();
  }
}

function createSessionRequest(appOrigin: string): MailHttpRequestFn {
  return async ({ method, path, body, signal }) => {
    const response = await session
      .fromPartition(PARTITION)
      .fetch(new URL(path, appOrigin).toString(), {
        method,
        headers: mailApiHeaders(path, body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };
}

async function injectAppCookies(appOrigin: string, storageStatePath: string) {
  const parsed = JSON.parse(readFileSync(storageStatePath, "utf8")) as {
    cookies?: StorageCookie[];
  };
  const ses = session.fromPartition(PARTITION);
  for (const cookie of parsed.cookies ?? []) {
    if (!isAppCookie(cookie, appOrigin)) continue;
    await ses.cookies.set({
      url: appOrigin,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: electronSameSite(cookie.sameSite),
      ...(cookie.expires > 0 ? { expirationDate: cookie.expires } : {}),
    });
  }
}

async function waitForTransport(
  window: BrowserWindow,
  expected: "desktop-ipc" | "browser",
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const transport = await readTransport(window);
    if (transport === expected) return transport;
    await delay(500);
  }
  throw new Error(
    `hosted mail inspect transport was ${await readTransport(window)}`,
  );
}

async function waitForSubject(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const subjects = await readSubjects(window);
    if (subjects.includes(subject)) return subjects;
    await delay(500);
  }
  throw new Error(`${subject} did not appear in the hosted inbox`);
}

async function waitForMissingSubject(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const subjects = await readSubjects(window);
    if (!subjects.includes(subject)) return;
    await delay(500);
  }
  throw new Error(`${subject} remained in the hosted inbox`);
}

async function clickArchive(window: BrowserWindow, subject: string) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const list = document.querySelector('[role="listbox"][aria-label="Conversations"]');
      const option = [...(list?.querySelectorAll('[role="option"]') ?? [])]
        .find((item) => item.textContent.includes(${JSON.stringify(subject)}));
      const checkbox = option?.querySelector('[role="checkbox"]');
      checkbox?.click();
      const archive = document.querySelector('button[aria-label="Archive"]');
      archive?.click();
      return Boolean(checkbox && archive);
    })()
  `)) as boolean;
  if (!clicked) throw new Error(`Archive control missing for ${subject}`);
}

async function readSubjects(window: BrowserWindow) {
  return (await window.webContents.executeJavaScript(`
    [...(document.querySelector('[role="listbox"][aria-label="Conversations"]')
      ?.querySelectorAll('[role="option"]') ?? [])]
      .map((option) => option.textContent ?? "")
  `)) as string[];
}

async function readTransport(window: BrowserWindow) {
  return (await window.webContents.executeJavaScript(`
    window.__inboxZeroMailInspect?.transport ?? null
  `)) as "browser" | "desktop-ipc" | null;
}

async function readNativeInboxSubjects(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  const snapshot = (await owner.handleIpc({
    protocolVersion: 1,
    requestId: "hosted-inbox",
    method: "observeMailbox",
    payload: {
      accountIds: [accountId],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    },
  })) as {
    result?: {
      data?: { conversations?: Array<{ subject?: string }> };
    };
  };
  return (
    snapshot.result?.data?.conversations
      ?.map((conversation) => conversation.subject)
      .filter((subject): subject is string => Boolean(subject)) ?? []
  );
}

async function captureWindow(window: BrowserWindow) {
  const screenshotPath = process.env.ELECTRON_SCREENSHOT_PATH;
  if (!screenshotPath) return;
  const image = await window.webContents.capturePage();
  writeFileSync(screenshotPath, image.toPNG());
}

function getDesktopAppOrigin(appUrl: string) {
  const parsed = new URL(appUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ELECTRON_APP_URL must be an http(s) URL");
  }
  return parsed.origin;
}

function isAppCookie(cookie: StorageCookie, appOrigin: string) {
  const host = new URL(appOrigin).hostname;
  const domain = cookie.domain.replace(/^\./u, "");
  return domain === host || host.endsWith(`.${domain}`);
}

function electronSameSite(
  value: StorageCookie["sameSite"],
): "strict" | "lax" | "no_restriction" {
  if (value === "Strict") return "strict";
  if (value === "None") return "no_restriction";
  return "lax";
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StorageCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};
