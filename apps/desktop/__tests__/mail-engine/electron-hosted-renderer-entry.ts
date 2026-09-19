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
import { createOriginMailRequest } from "../../src/mail-engine/request";
import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";

const PARTITION = "persist:inbox-zero";
const PROOF = process.env.ELECTRON_PROOF ?? "search-archive";
const ARCHIVE_SUBJECT =
  process.env.ELECTRON_ARCHIVE_SUBJECT ?? "Archive Action Message";
const SEARCH_QUERY = process.env.ELECTRON_SEARCH_QUERY ?? "Archive Action";
const SEARCH_HIDDEN_SUBJECT =
  process.env.ELECTRON_SEARCH_HIDDEN ?? "Keyboard Navigation Message";
const DRAFT_SUBJECT =
  process.env.ELECTRON_DRAFT_SUBJECT ?? "Hosted desktop draft example";
const DISCARD_SUBJECT =
  process.env.ELECTRON_DISCARD_SUBJECT ?? "Hosted desktop discard example";
const SEND_SUBJECT =
  process.env.ELECTRON_SEND_SUBJECT ?? "Hosted desktop send example";
const STAR_SUBJECT =
  process.env.ELECTRON_STAR_SUBJECT ?? "Second Unread Command Message";
const STAR_THREAD_ID =
  process.env.ELECTRON_STAR_THREAD_ID ?? "thr_playwright_3";
const DRAFT_TO = process.env.ELECTRON_DRAFT_TO ?? "recipient@example.com";
const DRAFT_BODY = process.env.ELECTRON_DRAFT_BODY ?? "A hosted desktop draft.";

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
  const authGate = createBlockedAuthGate();
  await injectAppCookies(appOrigin, requiredEnv("ELECTRON_STORAGE_STATE"));
  const owner = await createDesktopMailOwner({
    databasePath: sqlitePath,
    ...createRoutedBackendPorts(
      wrapBlockedAuthRequest(createSessionRequest(appOrigin), authGate),
    ),
  });
  const window = new BrowserWindow({
    show: true,
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
    const payload =
      PROOF === "compose"
        ? await proveCompose(window, owner, accountId)
        : PROOF === "reconnect"
          ? await proveReconnect(window, accountId, authGate)
          : PROOF === "discard"
            ? await proveDiscard(window, owner, accountId)
            : PROOF === "send"
              ? await proveSend(window, owner, accountId)
              : PROOF === "star"
                ? await proveStar(window, owner, accountId)
                : await proveSearchArchive(window, owner, accountId);
    if (PROOF !== "reconnect") {
      window.show();
      await delay(250);
      await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    }
    process.stdout.write(
      `ELECTRON_HOSTED_MAIL ${JSON.stringify({
        electron: process.versions.electron,
        url: window.webContents.getURL(),
        transport,
        sqlitePath,
        sqliteExists: existsSync(sqlitePath),
        proof: PROOF,
        ...payload,
      })}\n`,
    );
  } finally {
    await owner.close();
    app.quit();
  }
}

async function proveSearchArchive(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  const subjectsBefore = await waitForSubject(window, ARCHIVE_SUBJECT);
  await waitForSubject(window, SEARCH_HIDDEN_SUBJECT);
  await searchMailbox(window, SEARCH_QUERY);
  const subjectsSearched = await waitForSearchResult(
    window,
    ARCHIVE_SUBJECT,
    SEARCH_HIDDEN_SUBJECT,
  );
  await captureWindow(window, process.env.ELECTRON_SEARCH_SCREENSHOT_PATH);
  await clearSearch(window);
  await waitForSubject(window, SEARCH_HIDDEN_SUBJECT);
  await clickArchive(window, ARCHIVE_SUBJECT);
  await waitForMissingSubject(window, ARCHIVE_SUBJECT, SEARCH_HIDDEN_SUBJECT);
  const subjectsAfter = await readSubjects(window);
  const nativeSubjects = await readNativeMailboxSubjects(
    owner,
    accountId,
    "inbox",
  );
  return {
    subjectsBefore,
    subjectsSearched,
    searchHidHiddenSubject: !subjectsSearched.some((text) =>
      text.includes(SEARCH_HIDDEN_SUBJECT),
    ),
    subjectsAfter,
    nativeInboxHasArchiveSubject: nativeSubjects.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
  };
}

async function proveCompose(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  await waitForConversations(window);
  await openCompose(window);
  await fillComposeDraft(window, DRAFT_SUBJECT);
  await closeCompose(window);
  await delay(500);
  await openDraftsMailbox(window);
  const draftSubjects = await waitForSubject(window, DRAFT_SUBJECT);
  const nativeDrafts = await readNativeMailboxSubjects(
    owner,
    accountId,
    "draft",
  );
  return {
    draftSubject: DRAFT_SUBJECT,
    draftSubjects,
    nativeDraftHasSubject: nativeDrafts.some((item) =>
      item.includes(DRAFT_SUBJECT),
    ),
  };
}

async function proveDiscard(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  await waitForConversations(window);
  await openCompose(window);
  await fillComposeDraft(window, DISCARD_SUBJECT);
  await closeCompose(window);
  await delay(500);
  await openDraftsMailbox(window);
  const discardedDraftSubjects = await waitForSubject(window, DISCARD_SUBJECT);
  const nativeDraftsBeforeDiscard = await waitForNativeRoleSubject(
    owner,
    accountId,
    "draft",
    DISCARD_SUBJECT,
    true,
  );
  await clickConversation(window, DISCARD_SUBJECT);
  await clickDiscardDraft(window);
  await waitForSubjectGone(window, DISCARD_SUBJECT);
  const nativeDraftsAfterDiscard = await waitForNativeRoleSubject(
    owner,
    accountId,
    "draft",
    DISCARD_SUBJECT,
    false,
  );
  return {
    discardSubject: DISCARD_SUBJECT,
    discardedDraftSubjects,
    nativeDraftHadDiscardSubject: nativeDraftsBeforeDiscard.some((item) =>
      item.includes(DISCARD_SUBJECT),
    ),
    nativeDraftHasDiscardSubject: nativeDraftsAfterDiscard.some((item) =>
      item.includes(DISCARD_SUBJECT),
    ),
  };
}

async function proveSend(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  await waitForConversations(window);
  await openCompose(window);
  await fillComposeDraft(window, SEND_SUBJECT);
  await delay(3000);
  await clickSend(window);
  await waitForComposeClosed(window);
  const sendSucceeded = await waitForSendSucceeded(window);
  await openDraftsMailbox(window);
  await waitForSubjectGone(window, SEND_SUBJECT);
  const nativeDraftsAfterSend = await waitForNativeRoleSubject(
    owner,
    accountId,
    "draft",
    SEND_SUBJECT,
    false,
  );
  const nativeSent = await waitForNativeRoleSubject(
    owner,
    accountId,
    "sent",
    SEND_SUBJECT,
    true,
  );
  await openSentMailbox(window);
  const sentSubjects = await waitForSubject(window, SEND_SUBJECT);
  return {
    sendSubject: SEND_SUBJECT,
    sendSucceeded,
    nativeDraftHasSendSubject: nativeDraftsAfterSend.some((item) =>
      item.includes(SEND_SUBJECT),
    ),
    nativeSentHasSendSubject: nativeSent.some((item) =>
      item.includes(SEND_SUBJECT),
    ),
    sentSubjects,
  };
}

async function proveStar(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  await waitForSubject(window, STAR_SUBJECT);
  await clickConversation(window, STAR_SUBJECT);
  await clickMoreActionsStar(window);
  const readerStarred = await waitForStarredReader(window);
  const starSucceeded = await waitForStarSucceeded(window, STAR_THREAD_ID);
  const nativeStarred = await waitForNativeStarredSubject(
    owner,
    accountId,
    STAR_SUBJECT,
    true,
  );
  return {
    starSubject: STAR_SUBJECT,
    readerStarred,
    starSucceeded,
    nativeStarredHasSubject: nativeStarred.some((item) =>
      item.includes(STAR_SUBJECT),
    ),
  };
}

async function proveReconnect(
  window: BrowserWindow,
  accountId: string,
  gate: BlockedAuthGate,
) {
  await waitForSubject(window, ARCHIVE_SUBJECT);
  gate.enabled = true;
  await waitForReconnectBanner(window);
  window.show();
  await delay(250);
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const connection = await readInspectConnection(window);
  const reconnectPath = `/${accountId}/mail?reconnect=blocked`;
  await stubLinkingAuthUrl(window, reconnectPath);
  await clickReconnect(window);
  await waitForReconnectUrl(window, reconnectPath);
  return {
    connection,
    changeRequests: gate.changes,
    enumerationRequests: gate.enumeration,
    reconnectUrl: window.webContents.getURL(),
    headingVisible: true,
  };
}

function createSessionRequest(appOrigin: string): MailHttpRequestFn {
  const ses = session.fromPartition(PARTITION);
  return createOriginMailRequest({
    origin: appOrigin,
    cookieHeader: async (url) => {
      const cookies = await ses.cookies.get({ url });
      return cookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    },
  });
}

function createBlockedAuthGate(): BlockedAuthGate {
  return { enabled: false, changes: 0, enumeration: 0 };
}

function wrapBlockedAuthRequest(
  request: MailHttpRequestFn,
  gate: BlockedAuthGate,
): MailHttpRequestFn {
  return async (input) => {
    if (input.path.includes("/changes") && gate.enabled) {
      gate.changes += 1;
      return {
        status: 401,
        json: {
          protocolVersion: 1,
          requestId: "hosted-electron-blocked-auth",
          error: {
            code: "blocked_auth",
            retryable: true,
            retryAfterMs: null,
          },
        },
      };
    }
    if (gate.enabled && input.path.includes("/enumeration")) {
      gate.enumeration += 1;
    }
    return request(input);
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

async function waitForConversations(window: BrowserWindow) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const count = (await window.webContents.executeJavaScript(`
      document.querySelector('[role="listbox"][aria-label="Conversations"]')
        ?.querySelectorAll('[role="option"]').length ?? 0
    `)) as number;
    if (count > 0) return;
    await delay(500);
  }
  const body = await readBodyText(window);
  throw new Error(
    `hosted inbox never listed conversations: ${body.slice(0, 2000)}`,
  );
}

async function waitForSubject(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const subjects = await readSubjects(window);
    if (subjects.some((text) => text.includes(subject))) return subjects;
    await delay(500);
  }
  const body = await readBodyText(window);
  throw new Error(
    `${subject} did not appear in the hosted inbox: ${body.slice(0, 2000)}`,
  );
}

async function waitForMissingSubject(
  window: BrowserWindow,
  subject: string,
  stillPresent: string,
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const subjects = await readSubjects(window);
    if (
      !subjects.some((text) => text.includes(subject)) &&
      subjects.some((text) => text.includes(stillPresent))
    ) {
      return;
    }
    await delay(500);
  }
  throw new Error(`${subject} remained in the hosted inbox`);
}

async function waitForSubjectGone(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const subjects = await readSubjects(window);
    if (!subjects.some((text) => text.includes(subject))) return;
    await delay(500);
  }
  throw new Error(`${subject} remained in the hosted mailbox`);
}

async function searchMailbox(window: BrowserWindow, query: string) {
  const filled = (await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('input[aria-label="Search mail"]');
      if (!(input instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `)) as boolean;
  if (!filled) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error("Search mail field missing");
  }
  await delay(50);
  await window.webContents.executeJavaScript(`
    document.querySelector('input[aria-label="Search mail"]')?.form?.requestSubmit()
  `);
}

async function waitForSearchResult(
  window: BrowserWindow,
  visible: string,
  hidden: string,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const subjects = await readSubjects(window);
    if (
      subjects.some((text) => text.includes(visible)) &&
      !subjects.some((text) => text.includes(hidden))
    ) {
      return subjects;
    }
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SEARCH_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(
    `hosted search ${JSON.stringify(SEARCH_QUERY)} did not hide ${hidden}: ${body.slice(0, 2000)}`,
  );
}

async function clearSearch(window: BrowserWindow) {
  const cleared = (await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Clear search"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `)) as boolean;
  if (!cleared) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error("Clear search control missing");
  }
}

async function clickArchive(window: BrowserWindow, subject: string) {
  const selection = (await window.webContents.executeJavaScript(`
    (() => {
      const list = document.querySelector('[role="listbox"][aria-label="Conversations"]');
      const option = [...(list?.querySelectorAll('[role="option"]') ?? [])]
        .find((item) => (item.textContent ?? "").includes(${JSON.stringify(subject)}));
      const checkbox = option?.querySelector('[role="checkbox"]');
      if (!(checkbox instanceof HTMLElement)) {
        return {
          ok: false,
          optionCount: list?.querySelectorAll('[role="option"]').length ?? 0,
          checkboxCount: document.querySelectorAll('[role="checkbox"]').length,
        };
      }
      checkbox.click();
      return { ok: true };
    })()
  `)) as { ok: boolean; optionCount?: number; checkboxCount?: number };
  if (!selection.ok) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error(
      `Selection checkbox missing for ${subject} (options=${selection.optionCount} checkboxes=${selection.checkboxCount})`,
    );
  }

  // ListToolbar Archive only mounts after selectedCount > 0; that paint
  // happens after this executeJavaScript stack returns.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const archiveVisible = (await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('button[aria-label="Archive"]'))`,
    )) as boolean;
    if (archiveVisible) {
      await window.webContents.executeJavaScript(`
        document.querySelector('button[aria-label="Archive"]')?.click()
      `);
      return;
    }
    await delay(50);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(
    `Archive control missing for ${subject}: ${body.slice(0, 2000)}`,
  );
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

async function readBodyText(window: BrowserWindow) {
  return String(
    await window.webContents
      .executeJavaScript('document.body ? document.body.innerText : ""')
      .catch(() => ""),
  );
}

async function openCompose(window: BrowserWindow) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll("button")].find((item) => {
        if (item.getAttribute("aria-label") === "Compose") return true;
        return [...item.querySelectorAll("span")].some(
          (span) => span.textContent?.trim() === "Compose",
        );
      });
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `)) as boolean;
  if (!clicked) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error("Compose control missing");
  }
  // Dialog chrome is in ComposeModalProvider; the To field lives in the
  // lazy ComposeEmailForm chunk and can land after "New Message".
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = (await window.webContents.executeJavaScript(`
      (() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
          (item) => (item.textContent ?? "").includes("New Message"),
        );
        if (!(dialog instanceof HTMLElement)) return false;
        return Boolean(
          dialog.querySelector('input[aria-label="To"]') ??
            dialog.querySelector('input[name="to"]') ??
            dialog.querySelector('input[role="combobox"]'),
        );
      })()
    `)) as boolean;
    if (ready) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`New Message dialog missing: ${body.slice(0, 2000)}`);
}

async function fillComposeDraft(window: BrowserWindow, subjectValue: string) {
  const filled = (await window.webContents.executeJavaScript(`
    (() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
        (item) => (item.textContent ?? "").includes("New Message"),
      );
      if (!(dialog instanceof HTMLElement)) return { ok: false, step: "dialog" };
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      const to =
        dialog.querySelector('input[aria-label="To"]') ??
        dialog.querySelector('input[name="to"]') ??
        dialog.querySelector('input[role="combobox"]');
      if (!(to instanceof HTMLInputElement) || !setter) {
        return {
          ok: false,
          step: "to",
          inputs: [...dialog.querySelectorAll("input")].map((input) => ({
            name: input.name,
            aria: input.getAttribute("aria-label"),
            placeholder: input.placeholder,
            role: input.getAttribute("role"),
          })),
        };
      }
      to.focus();
      setter.call(to, ${JSON.stringify(DRAFT_TO)});
      to.dispatchEvent(new Event("input", { bubbles: true }));
      to.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      const subject = dialog.querySelector('input[placeholder="Subject"]');
      if (!(subject instanceof HTMLInputElement)) {
        return { ok: false, step: "subject" };
      }
      subject.focus();
      document.execCommand("selectAll");
      const subjectInserted = document.execCommand(
        "insertText",
        false,
        ${JSON.stringify(subjectValue)},
      );
      if (!subjectInserted) {
        setter.call(subject, ${JSON.stringify(subjectValue)});
        subject.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const editor = dialog.querySelector(
        '[role="textbox"][aria-label="Email message"]',
      );
      if (!(editor instanceof HTMLElement)) {
        return { ok: false, step: "editor" };
      }
      editor.focus();
      document.execCommand("selectAll");
      const inserted = document.execCommand(
        "insertText",
        false,
        ${JSON.stringify(DRAFT_BODY)},
      );
      if (!inserted) {
        editor.textContent = ${JSON.stringify(DRAFT_BODY)};
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return { ok: true };
    })()
  `)) as { ok: boolean; step?: string; inputs?: unknown };
  if (!filled.ok) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error(
      `Compose draft fields missing (${filled.step}) ${JSON.stringify(filled.inputs ?? [])}`,
    );
  }
  await delay(500);
}

async function closeCompose(window: BrowserWindow) {
  const closed = (await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Close compose"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `)) as boolean;
  if (!closed) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error("Close compose control missing");
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const open = (await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('[role="dialog"]')].some((dialog) =>
        (dialog.textContent ?? "").includes("New Message"),
      )
    `)) as boolean;
    if (!open) return;
    await delay(50);
  }
  throw new Error("New Message dialog stayed open after close");
}

async function openDraftsMailbox(window: BrowserWindow) {
  let expandedMail = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const opened = (await window.webContents.executeJavaScript(`
      (() => {
        const drafts = [...document.querySelectorAll("a")].find((link) =>
          [...link.querySelectorAll("span")].some(
            (span) => span.textContent?.trim() === "Drafts",
          ),
        );
        if (drafts instanceof HTMLElement) {
          drafts.click();
          return "drafts";
        }
        return "missing";
      })()
    `)) as "drafts" | "missing";
    if (opened === "drafts") return;
    if (!expandedMail) {
      expandedMail = true;
      await window.webContents.executeJavaScript(`
        (() => {
          const mail = [...document.querySelectorAll("button")].find((button) =>
            [...button.querySelectorAll("span")].some(
              (span) => span.textContent?.trim() === "Mail",
            ),
          );
          if (mail instanceof HTMLElement) mail.click();
        })()
      `);
    }
    await delay(50);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`Drafts mailbox missing: ${body.slice(0, 2000)}`);
}

async function openSentMailbox(window: BrowserWindow) {
  let expandedMail = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const opened = (await window.webContents.executeJavaScript(`
      (() => {
        const sent = [...document.querySelectorAll("a")].find((link) =>
          [...link.querySelectorAll("span")].some(
            (span) => span.textContent?.trim() === "Sent",
          ),
        );
        if (sent instanceof HTMLElement) {
          sent.click();
          return "sent";
        }
        return "missing";
      })()
    `)) as "sent" | "missing";
    if (opened === "sent") return;
    if (!expandedMail) {
      expandedMail = true;
      await window.webContents.executeJavaScript(`
        (() => {
          const mail = [...document.querySelectorAll("button")].find((button) =>
            [...button.querySelectorAll("span")].some(
              (span) => span.textContent?.trim() === "Mail",
            ),
          );
          if (mail instanceof HTMLElement) mail.click();
        })()
      `);
    }
    await delay(50);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`Sent mailbox missing: ${body.slice(0, 2000)}`);
}

async function clickConversation(window: BrowserWindow, subject: string) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const list = document.querySelector('[role="listbox"][aria-label="Conversations"]');
      const option = [...(list?.querySelectorAll('[role="option"]') ?? [])]
        .find((item) => (item.textContent ?? "").includes(${JSON.stringify(subject)}));
      if (!(option instanceof HTMLElement)) {
        return {
          ok: false,
          optionCount: list?.querySelectorAll('[role="option"]').length ?? 0,
        };
      }
      option.click();
      return { ok: true };
    })()
  `)) as { ok: boolean; optionCount?: number };
  if (!clicked.ok) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error(
      `Conversation missing for ${subject} (options=${clicked.optionCount})`,
    );
  }
}

async function clickMoreActionsStar(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = (await window.webContents.executeJavaScript(`
      (() => {
        const more = [...document.querySelectorAll("button")].find((button) => {
          const label = button.getAttribute("aria-label") ?? "";
          const text = (button.textContent ?? "").trim();
          return /^More actions/.test(label) || /^More actions/.test(text);
        });
        if (!(more instanceof HTMLElement)) return "missing-more";
        const openMenu = document.querySelector('[role="menu"]');
        if (!openMenu) {
          more.click();
          return "opened";
        }
        const star = [...openMenu.querySelectorAll('[role="menuitem"]')].find(
          (item) => (item.textContent ?? "").trim() === "Star",
        );
        if (!(star instanceof HTMLElement)) return "missing-star";
        star.click();
        return "starred";
      })()
    `)) as "missing-more" | "opened" | "missing-star" | "starred";
    if (clicked === "starred") return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`Star control missing: ${body.slice(0, 2000)}`);
}

async function clickDiscardDraft(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const clicked = (await window.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll("button")].find(
          (item) => item.getAttribute("aria-label") === "Discard draft",
        );
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
      })()
    `)) as boolean;
    if (clicked) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`Discard draft control missing: ${body.slice(0, 2000)}`);
}

async function clickSend(window: BrowserWindow) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
        (item) => (item.textContent ?? "").includes("New Message"),
      );
      const send = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (button) =>
          button instanceof HTMLButtonElement &&
          button.type === "submit" &&
          !button.hidden &&
          (button.textContent ?? "").includes("Send"),
      );
      if (!(send instanceof HTMLElement)) return false;
      send.click();
      return true;
    })()
  `)) as boolean;
  if (!clicked) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error("Send control missing");
  }
}

async function waitForComposeClosed(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const open = (await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('[role="dialog"]')].some((dialog) =>
        (dialog.textContent ?? "").includes("New Message"),
      )
    `)) as boolean;
    if (!open) return;
    await delay(250);
  }
  throw new Error("New Message dialog stayed open after send");
}

async function waitForSendSucceeded(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = (await window.webContents.executeJavaScript(`
      (async () => {
        const inspect = window.__inboxZeroMailInspect;
        if (!inspect?.read) return { status: "missing" };
        const diagnostics = await inspect.read();
        const send = diagnostics?.commands
          ?.filter((command) => command.kind === "send")
          .at(-1);
        return send
          ? { status: send.status, kind: send.kind }
          : { status: "missing" };
      })()
    `)) as { status?: string };
    if (result.status === "succeeded") return true;
    if (
      result.status === "failed" ||
      result.status === "cancelled" ||
      result.status === "needs_attention"
    ) {
      throw new Error(`hosted send ${result.status}`);
    }
    await delay(500);
  }
  throw new Error("hosted send never reached succeeded");
}

async function waitForStarredReader(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const visible = (await window.webContents.executeJavaScript(`
      Boolean(
        document.querySelector(
          '[data-testid="thread-reader"] img[aria-label="Starred conversation"]',
        ),
      )
    `)) as boolean;
    if (visible) return true;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error("reader never showed Starred conversation");
}

async function waitForStarSucceeded(window: BrowserWindow, threadId: string) {
  const slug = JSON.stringify(threadId.slice("thr_".length));
  const expectedThreadId = JSON.stringify(threadId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = (await window.webContents.executeJavaScript(`
      (async () => {
        const inspect = window.__inboxZeroMailInspect;
        if (!inspect?.read) return { status: "missing" };
        const diagnostics = await inspect.read();
        const threadId = ${expectedThreadId};
        const slug = ${slug};
        const star = diagnostics?.commands
          ?.filter((command) => {
            const change = command.change;
            if (change?.kind !== "set_starred" || change.starred !== true) {
              return false;
            }
            if (command.conversationIds?.includes(threadId)) return true;
            return (command.messageIds ?? []).some(
              (messageId) =>
                messageId === "msg_" + slug ||
                messageId.startsWith("msg_" + slug + "_"),
            );
          })
          .at(-1);
        return star
          ? { status: star.status, kind: star.change?.kind }
          : { status: "missing" };
      })()
    `)) as { status?: string };
    if (result.status === "succeeded") return true;
    if (
      result.status === "failed" ||
      result.status === "cancelled" ||
      result.status === "needs_attention"
    ) {
      throw new Error(`hosted star ${result.status}`);
    }
    await delay(500);
  }
  throw new Error("hosted star never reached succeeded");
}

async function waitForNativeStarredSubject(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  subject: string,
  present: boolean,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const subjects = await readNativeStarredSubjects(owner, accountId);
    if (subjects.some((item) => item.includes(subject)) === present) {
      return subjects;
    }
    await delay(500);
  }
  throw new Error(
    `native starred ${present ? "never contained" : "still contained"} ${subject}`,
  );
}

async function waitForNativeRoleSubject(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  role: "inbox" | "draft" | "sent",
  subject: string,
  present: boolean,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const subjects = await readNativeMailboxSubjects(owner, accountId, role);
    if (subjects.some((item) => item.includes(subject)) === present) {
      return subjects;
    }
    await delay(500);
  }
  throw new Error(
    `native ${role} ${present ? "never contained" : "still contained"} ${subject}`,
  );
}

async function readNativeMailboxSubjects(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  role: "inbox" | "draft" | "sent",
) {
  const snapshot = (await owner.handleIpc({
    protocolVersion: 1,
    requestId: `hosted-${role}`,
    method: "observeMailbox",
    payload: {
      accountIds: [accountId],
      predicate: { kind: "role", role },
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

async function readNativeStarredSubjects(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  const snapshot = (await owner.handleIpc({
    protocolVersion: 1,
    requestId: "hosted-starred",
    method: "observeMailbox",
    payload: {
      accountIds: [accountId],
      predicate: {
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          { kind: "starred", value: true },
        ],
      },
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

async function captureWindow(window: BrowserWindow, screenshotPath?: string) {
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

async function waitForReconnectBanner(window: BrowserWindow) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const visible = (await window.webContents.executeJavaScript(`
      [...document.querySelectorAll("h2")].some(
        (heading) =>
          heading.textContent === "Reconnect this account to continue syncing.",
      )
    `)) as boolean;
    if (visible) return;
    await delay(500);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(
    `Reconnect banner missing after blocked_auth: ${body.slice(0, 2000)}`,
  );
}

async function readInspectConnection(window: BrowserWindow) {
  return (await window.webContents.executeJavaScript(`
    (async () => {
      const inspect = window.__inboxZeroMailInspect;
      if (!inspect?.read) return null;
      const diagnostics = await inspect.read();
      return diagnostics?.connection ?? null;
    })()
  `)) as string | null;
}

async function stubLinkingAuthUrl(
  window: BrowserWindow,
  reconnectPath: string,
) {
  const patched = (await window.webContents.executeJavaScript(`
    (() => {
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = String(input);
        if (url.includes("/linking/auth-url")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ url: ${JSON.stringify(reconnectPath)} }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
          );
        }
        return original(input, init);
      };
      return true;
    })()
  `)) as boolean;
  if (!patched) throw new Error("Could not stub linking auth-url fetch");
}

async function clickReconnect(window: BrowserWindow) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll("button")].find(
        (item) => item.textContent?.trim() === "Reconnect",
      );
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `)) as boolean;
  if (!clicked) {
    await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
    throw new Error("Reconnect control missing");
  }
}

async function waitForReconnectUrl(
  window: BrowserWindow,
  reconnectPath: string,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (window.webContents.getURL().includes("reconnect=blocked")) return;
    await delay(250);
  }
  throw new Error(
    `hosted mail did not open ${reconnectPath}: ${window.webContents.getURL()}`,
  );
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BlockedAuthGate = {
  enabled: boolean;
  changes: number;
  enumeration: number;
};

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
