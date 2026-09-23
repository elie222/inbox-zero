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
import { registerMailEnginePushIpc } from "../../src/mail-engine/push-ipc";
import { createRoutedBackendPorts } from "../../src/mail-engine/backend";
import { createOriginMailRequest } from "../../src/mail-engine/request";
import { closeAndWipeDesktopMailbox } from "../../src/mail-engine/wipe";
import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";
import { changesRequestSchema } from "@inboxzero/mail-core/protocol/mail-http";

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
const BULK_FIRST_SUBJECT = "Playwright Test Message";
const BULK_SECOND_SUBJECT = "Read Command Message";
const DELETE_SUBJECT = "Delete Action Message";
const LABEL_SUBJECT = "Re: Reader Navigation Message";
const BULK_FIRST_THREAD = "thr_playwright_1";
const BULK_SECOND_THREAD = "thr_playwright_2";
const DELETE_THREAD = "thr_playwright_delete";
const LABEL_THREAD = "thr_playwright_reader";
const DRAFT_TO = process.env.ELECTRON_DRAFT_TO ?? "recipient@example.com";
const DRAFT_BODY = process.env.ELECTRON_DRAFT_BODY ?? "A hosted desktop draft.";
const HOSTED_IDLE_PROOF_TIMEOUT_MS = 90_000;
const HOSTED_PROOF_POLL_MS = 500;

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
  let owner: Awaited<ReturnType<typeof createDesktopMailOwner>> | undefined =
    await createDesktopMailOwner({
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
    (_event: IpcMainInvokeEvent, payload: unknown) => {
      if (!owner) return { status: "invalid" };
      return owner.handleIpc(payload);
    },
  );
  registerMailEnginePushIpc({ ipcMain, getOwner: () => owner });
  ipcMain.handle("mail-engine-wipe", async () => {
    const current = owner;
    owner = undefined;
    await closeAndWipeDesktopMailbox({
      owner: current,
      databasePath: sqlitePath,
    });
    return { status: "ok" };
  });
  const mailUrl = new URL(`/${accountId}/mail`, appOrigin).toString();
  try {
    await window.loadURL(mailUrl);
    const transport = await waitForTransport(window, "desktop-ipc");
    if (!owner) throw new Error("desktop mail owner is missing");
    const payload = await runProof({
      window,
      owner,
      accountId,
      gate: authGate,
      sqlitePath,
    });
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
        sqliteWalExists: existsSync(`${sqlitePath}-wal`),
        sqliteShmExists: existsSync(`${sqlitePath}-shm`),
        proof: PROOF,
        ...payload,
      })}\n`,
    );
  } finally {
    try {
      await owner?.close();
    } catch {
      // Sign out may already have closed the owner.
    }
    app.quit();
  }
}

async function runProof(input: {
  window: BrowserWindow;
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>;
  accountId: string;
  gate: BlockedAuthGate;
  sqlitePath: string;
}) {
  switch (PROOF) {
    case "compose":
      return proveCompose(input.window, input.owner, input.accountId);
    case "reconnect":
      return proveReconnect(input.window, input.accountId, input.gate);
    case "discard":
      return proveDiscard(input.window, input.owner, input.accountId);
    case "send":
      return proveSend(input.window, input.owner, input.accountId);
    case "star":
      return proveStar(input.window, input.owner, input.accountId);
    case "assistant-baseline":
      return proveAssistantBaseline(input.window, input.owner, input.accountId);
    case "assistant-reopen":
      return proveAssistantReopen(
        input.window,
        input.owner,
        input.accountId,
        input.gate,
      );
    case "missed-hint":
      return proveMissedHint(
        input.window,
        input.owner,
        input.accountId,
        input.gate,
      );
    case "cursor-reset":
      return proveCursorReset(
        input.window,
        input.owner,
        input.accountId,
        input.gate,
      );
    case "bulk":
      return proveBulk(input.window, input.owner, input.accountId);
    case "queued-restart":
      return proveQueuedRestart(
        input.window,
        input.owner,
        input.accountId,
        input.gate,
      );
    case "inbox-counts":
      return proveInboxCounts(input.window, input.owner, input.accountId);
    case "sign-out":
      return proveSignOut(input.window, input.sqlitePath);
    case "archive-new-mail":
      return proveArchiveNewMail(
        input.window,
        input.owner,
        input.accountId,
        input.gate,
      );
    default:
      return proveSearchArchive(input.window, input.owner, input.accountId);
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
  await waitForConversations(window);
  await waitForSubject(window, STAR_SUBJECT);
  await clickConversation(window, STAR_SUBJECT);
  await waitForThreadReader(window);
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

async function proveAssistantBaseline(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  const subjectsBefore = await waitForSubject(window, ARCHIVE_SUBJECT);
  const nativeInbox = await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    true,
  );
  const assistantCursor = await waitForAssistantCursor(window, false);
  return {
    subjectsBefore,
    nativeInboxHasArchiveSubject: nativeInbox.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
    assistantCursor,
  };
}

async function proveAssistantReopen(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  gate: BlockedAuthGate,
) {
  await waitForConversations(window);
  await waitForSubjectGone(window, ARCHIVE_SUBJECT);
  const nativeInbox = await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    false,
  );
  const assistantCursor = await waitForAssistantCursor(window, true);
  return {
    subjectsAfter: await readSubjects(window),
    nativeInboxHasArchiveSubject: nativeInbox.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
    assistantCursor,
    assistantStateRequests: gate.assistantState,
  };
}

async function proveMissedHint(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  gate: BlockedAuthGate,
) {
  const subjectsBefore = await waitForSubject(window, ARCHIVE_SUBJECT);
  await waitForCoverage(window);
  gate.countCatchUp = true;
  writeReadyFile();
  await waitForMissingSubject(window, ARCHIVE_SUBJECT, SEARCH_HIDDEN_SUBJECT);
  const nativeInbox = await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    false,
  );
  return {
    subjectsBefore,
    subjectsAfter: await readSubjects(window),
    nativeInboxHasArchiveSubject: nativeInbox.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
    changeRequests: gate.changes,
    enumerationRequests: gate.enumeration,
    bootstrapRequests: gate.bootstrap,
  };
}

async function proveCursorReset(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  gate: BlockedAuthGate,
) {
  const subjectsBefore = await waitForSubject(window, ARCHIVE_SUBJECT);
  await waitForCoverage(window);
  gate.countCatchUp = true;
  gate.resetOnce = true;
  await requestHostedSync(window);
  await waitForResetRebuild(gate);
  await waitForSubject(window, ARCHIVE_SUBJECT);
  const nativeInbox = await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    true,
  );
  return {
    subjectsBefore,
    subjectsAfter: await readSubjects(window),
    nativeInboxHasArchiveSubject: nativeInbox.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
    changeRequests: gate.changes,
    enumerationRequests: gate.enumeration,
    bootstrapRequests: gate.bootstrap,
    resetFired: gate.resetFired,
  };
}

async function proveBulk(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  await waitForConversations(window);
  await waitForSubject(window, BULK_FIRST_SUBJECT);
  await waitForSubject(window, BULK_SECOND_SUBJECT);
  await selectConversation(window, BULK_FIRST_SUBJECT);
  await selectConversation(window, BULK_SECOND_SUBJECT);
  await clickToolbarButton(window, "Archive");
  await waitForMissingSubject(
    window,
    BULK_FIRST_SUBJECT,
    SEARCH_HIDDEN_SUBJECT,
  );
  await waitForMissingSubject(
    window,
    BULK_SECOND_SUBJECT,
    SEARCH_HIDDEN_SUBJECT,
  );
  const bulkArchived =
    (await waitForInspectSucceeded(window, {
      kind: "archive",
      threadId: BULK_FIRST_THREAD,
    })) &&
    (await waitForInspectSucceeded(window, {
      kind: "archive",
      threadId: BULK_SECOND_THREAD,
    }));
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    BULK_FIRST_SUBJECT,
    false,
  );
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    BULK_SECOND_SUBJECT,
    false,
  );
  await undoLastTriage(window);
  await waitForSubject(window, BULK_FIRST_SUBJECT);
  await waitForSubject(window, BULK_SECOND_SUBJECT);
  const bulkUndone =
    (await waitForInspectSucceeded(window, {
      kind: "unarchive",
      threadId: BULK_FIRST_THREAD,
    })) &&
    (await waitForInspectSucceeded(window, {
      kind: "unarchive",
      threadId: BULK_SECOND_THREAD,
    }));
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    BULK_FIRST_SUBJECT,
    true,
  );
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    BULK_SECOND_SUBJECT,
    true,
  );

  await clickConversation(window, DELETE_SUBJECT);
  await waitForHeading(window, DELETE_SUBJECT);
  await clickMoreActionsItem(window, "Delete");
  await waitForSubjectGone(window, DELETE_SUBJECT);
  await waitForInspectSucceeded(window, {
    kind: "trash",
    threadId: DELETE_THREAD,
  });
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    DELETE_SUBJECT,
    false,
  );
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "trash",
    DELETE_SUBJECT,
    true,
  );
  await openNamedMailbox(window, "Trash");
  await waitForSubject(window, DELETE_SUBJECT);
  await undoLastTriage(window);
  await waitForSubjectGone(window, DELETE_SUBJECT);
  const trashRestored = await waitForInspectSucceeded(window, {
    kind: "untrash",
    threadId: DELETE_THREAD,
  });
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "trash",
    DELETE_SUBJECT,
    false,
  );
  await window.loadURL(
    new URL(
      `/${accountId}/mail`,
      getDesktopAppOrigin(requiredEnv("ELECTRON_APP_URL")),
    ).toString(),
  );
  await waitForTransport(window, "desktop-ipc");
  await waitForSubject(window, DELETE_SUBJECT);
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    DELETE_SUBJECT,
    true,
  );

  await clickConversation(window, LABEL_SUBJECT);
  await waitForHeading(window, LABEL_SUBJECT);
  await clickMoreActionsItem(window, "Label");
  await applyPickerLabel(window, "Project", "Project Alpha");
  const labelSucceeded = await waitForInspectSucceeded(window, {
    kind: "set_membership",
    threadId: LABEL_THREAD,
    payload: { membership: "label", id: "Label_project", present: true },
  });
  return {
    bulkArchived,
    bulkUndone,
    trashRestored,
    labelSucceeded,
    nativeInboxHasBulkSubjects: true,
    nativeTrashHasDeleteSubject: false,
  };
}

async function proveQueuedRestart(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  gate: BlockedAuthGate,
) {
  await waitForSubject(window, ARCHIVE_SUBJECT);
  await waitForSubject(window, SEARCH_HIDDEN_SUBJECT);
  armOperationsHold(gate);
  await clickArchive(window, ARCHIVE_SUBJECT);
  await waitForMissingSubject(window, ARCHIVE_SUBJECT, SEARCH_HIDDEN_SUBJECT);
  const queuedBeforeReload = await waitForInspectStatus(window, {
    kind: "archive",
    threadId: "thr_playwright_archive",
    statuses: [
      "queued",
      "preparing",
      "executing",
      "verifying",
      "uncertain",
      "retry_wait",
    ],
  });
  await waitForHeldOperations(gate);
  const mailUrl = window.webContents.getURL();
  await window.loadURL(mailUrl);
  await waitForTransport(window, "desktop-ipc");
  await waitForMissingSubject(window, ARCHIVE_SUBJECT, SEARCH_HIDDEN_SUBJECT);
  const queuedAfterReload = await waitForInspectStatus(window, {
    kind: "archive",
    threadId: "thr_playwright_archive",
    statuses: [
      "queued",
      "preparing",
      "executing",
      "verifying",
      "uncertain",
      "retry_wait",
    ],
  });
  gate.releaseOperations();
  const succeededAfterRelease = await waitForInspectSucceeded(window, {
    kind: "archive",
    threadId: "thr_playwright_archive",
  });
  const nativeInbox = await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    false,
  );
  return {
    queuedBeforeReload,
    queuedAfterReload,
    succeededAfterRelease,
    heldOperations: gate.heldOperations,
    hiddenAfterReload: true,
    nativeInboxHasArchiveSubject: nativeInbox.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
  };
}

async function proveInboxCounts(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
) {
  await waitForConversations(window);
  await waitForCoverage(window);
  await clickExactButton(window, "Unread");
  await waitForSubject(window, STAR_SUBJECT);
  await clickExactButton(window, "All");
  const inboxUnreadBefore = await waitForInboxUnreadBadge(
    window,
    (count) => count > 0,
  );
  await clickArchive(window, STAR_SUBJECT);
  await waitForSubjectGone(window, STAR_SUBJECT);
  const inboxUnreadAfterArchive = await waitForInboxUnreadBadge(
    window,
    (count) => count === inboxUnreadBefore - 1,
  );
  await clickExactButton(window, "Unread");
  await waitForSubjectGone(window, STAR_SUBJECT);
  await waitForInspectSucceeded(window, {
    kind: "archive",
    threadId: STAR_THREAD_ID,
  });
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    STAR_SUBJECT,
    false,
  );
  await clickExactButton(window, "All");
  await providerUnarchive(window, accountId, STAR_THREAD_ID);
  await waitForSubject(window, STAR_SUBJECT);
  const inboxUnreadAfterRestore = await waitForInboxUnreadBadge(
    window,
    (count) => count === inboxUnreadBefore,
  );
  await clickExactButton(window, "Unread");
  await waitForSubject(window, STAR_SUBJECT);
  return {
    inboxUnreadBefore,
    inboxUnreadAfterArchive,
    inboxUnreadAfterRestore,
    unreadHiddenAfterArchive: true,
    unreadVisibleAfterRestore: true,
  };
}

async function proveArchiveNewMail(
  window: BrowserWindow,
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  gate: BlockedAuthGate,
) {
  const subjectsBefore = await waitForSubject(window, ARCHIVE_SUBJECT);
  await waitForCoverage(window);
  gate.countCatchUp = true;
  await clickArchive(window, ARCHIVE_SUBJECT);
  await waitForSubjectGone(window, ARCHIVE_SUBJECT);
  const archiveSucceeded = await waitForInspectSucceeded(window, {
    kind: "archive",
    threadId: "thr_playwright_archive",
  });
  await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    false,
  );
  const subjectsAfterArchive = await readSubjects(window);
  writeReadyFile();
  const subjectsAfter = await waitForSubject(window, ARCHIVE_SUBJECT);
  const nativeInbox = await waitForNativeRoleSubject(
    owner,
    accountId,
    "inbox",
    ARCHIVE_SUBJECT,
    true,
  );
  return {
    subjectsBefore,
    subjectsAfterArchive,
    subjectsAfter,
    archiveSucceeded,
    nativeInboxHasArchiveSubject: nativeInbox.some((item) =>
      item.includes(ARCHIVE_SUBJECT),
    ),
    changeRequests: gate.changes,
    enumerationRequests: gate.enumeration,
  };
}

async function proveSignOut(window: BrowserWindow, sqlitePath: string) {
  await waitForConversations(window);
  const sqliteExistsBefore = existsSync(sqlitePath);
  const origin = new URL(window.webContents.getURL()).origin;
  await window.loadURL(`${origin}/settings`);
  await waitForHeading(window, "Settings");
  await clickNavUser(window);
  const signOutRect = await waitForMenuItemRect(window, "Sign out");
  await pointerClickAt(window, signOutRect);
  await waitForSignedOut(window);
  await waitForMailboxGone(sqlitePath);
  return {
    sqliteExistsBefore,
    sqliteExistsAfter: existsSync(sqlitePath),
    sqliteWalExistsAfter: existsSync(`${sqlitePath}-wal`),
    sqliteShmExistsAfter: existsSync(`${sqlitePath}-shm`),
    signedOut: true,
  };
}

async function proveReconnect(
  window: BrowserWindow,
  accountId: string,
  gate: BlockedAuthGate,
) {
  await waitForSubject(window, ARCHIVE_SUBJECT);
  gate.enabled = true;
  await requestHostedSync(window);
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
  return {
    enabled: false,
    countCatchUp: false,
    resetOnce: false,
    resetFired: false,
    holdingOperations: false,
    heldOperations: 0,
    operationsHold: Promise.resolve(),
    releaseOperations: () => {},
    changes: 0,
    enumeration: 0,
    bootstrap: 0,
    assistantState: 0,
  };
}

function armOperationsHold(gate: BlockedAuthGate) {
  gate.holdingOperations = true;
  gate.operationsHold = new Promise<void>((resolve) => {
    gate.releaseOperations = () => {
      gate.holdingOperations = false;
      resolve();
    };
  });
}

async function waitForHeldOperations(gate: BlockedAuthGate) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (gate.heldOperations > 0) return;
    await delay(250);
  }
  throw new Error("operations PUT was never held");
}

function wrapBlockedAuthRequest(
  request: MailHttpRequestFn,
  gate: BlockedAuthGate,
): MailHttpRequestFn {
  return async (input) => {
    if (input.path.includes("/assistant-state")) {
      gate.assistantState += 1;
    }
    if (input.path.includes("/changes")) {
      if (gate.countCatchUp || gate.enabled) {
        gate.changes += 1;
      }
      if (gate.resetOnce && !gate.resetFired) {
        const { position } = changesRequestSchema.parse(input.body);
        gate.resetFired = true;
        return {
          status: 200,
          json: {
            protocolVersion: 1,
            requestId: "hosted-electron-reset",
            status: "reset_required",
            scopeId: position.streamId,
          },
        };
      }
      if (gate.enabled) {
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
    }
    if (input.path.includes("/bootstrap") && gate.countCatchUp) {
      gate.bootstrap += 1;
    }
    if (
      input.path.includes("/enumeration") &&
      (gate.enabled || gate.countCatchUp)
    ) {
      gate.enumeration += 1;
    }
    if (
      gate.holdingOperations &&
      input.method === "PUT" &&
      input.path.includes("/operations/")
    ) {
      gate.heldOperations += 1;
      await gate.operationsHold;
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

async function waitForCoverage(window: BrowserWindow) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const complete = (await window.webContents.executeJavaScript(`
      (async () => {
        const inspect = window.__inboxZeroMailInspect;
        if (!inspect?.read) return false;
        const diagnostics = await inspect.read();
        return (
          (diagnostics?.coverage?.length ?? 0) > 0 &&
          diagnostics.coverage.every((item) => item.metadata === "complete")
        );
      })()
    `)) as boolean;
    if (complete) return;
    await delay(500);
  }
  throw new Error("hosted mail never reached metadata coverage");
}

function writeReadyFile() {
  const readyPath = process.env.ELECTRON_READY_PATH;
  if (!readyPath) return;
  writeFileSync(readyPath, "ready\n");
}

async function waitForResetRebuild(gate: BlockedAuthGate) {
  const deadline = Date.now() + HOSTED_IDLE_PROOF_TIMEOUT_MS;
  for (;;) {
    if (gate.resetFired && gate.bootstrap > 0 && gate.enumeration > 0) return;
    if (Date.now() >= deadline) break;
    await delay(HOSTED_PROOF_POLL_MS);
  }
  throw new Error(
    `hosted reset never rebuilt bootstrap=${gate.bootstrap} enumeration=${gate.enumeration} resetFired=${gate.resetFired} changes=${gate.changes}`,
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
  const deadline = Date.now() + HOSTED_IDLE_PROOF_TIMEOUT_MS;
  for (;;) {
    const subjects = await readSubjects(window);
    if (subjects.some((text) => text.includes(subject))) return subjects;
    if (Date.now() >= deadline) break;
    await delay(HOSTED_PROOF_POLL_MS);
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
  const deadline = Date.now() + HOSTED_IDLE_PROOF_TIMEOUT_MS;
  for (;;) {
    const subjects = await readSubjects(window);
    if (
      !subjects.some((text) => text.includes(subject)) &&
      subjects.some((text) => text.includes(stillPresent))
    ) {
      return;
    }
    if (Date.now() >= deadline) break;
    await delay(HOSTED_PROOF_POLL_MS);
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

async function selectConversation(window: BrowserWindow, subject: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const selection = (await window.webContents.executeJavaScript(`
      (() => {
        const list = document.querySelector('[role="listbox"][aria-label="Conversations"]');
        const option = [...(list?.querySelectorAll('[role="option"]') ?? [])]
          .find((item) => (item.textContent ?? "").includes(${JSON.stringify(subject)}));
        const checkbox = option?.querySelector('[role="checkbox"]');
        if (!(checkbox instanceof HTMLElement)) {
          return {
            ok: false,
            selected: option?.getAttribute("aria-selected") === "true",
          };
        }
        if (option?.getAttribute("aria-selected") === "true") return { ok: true };
        checkbox.click();
        return { ok: true };
      })()
    `)) as { ok: boolean };
    if (selection.ok) return;
    await delay(50);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error(`Selection checkbox missing for ${subject}`);
}

async function clickNavUser(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rect = (await window.webContents.executeJavaScript(`
      (() => {
        const footer = document.querySelector('[data-sidebar="footer"]');
        if (!(footer instanceof HTMLElement)) return null;
        const button = [...footer.querySelectorAll("button")].find((item) => {
          const text = (item.innerText ?? "").replace(/\\s+/g, " ").trim();
          return text.includes("Smoke Test User");
        });
        if (!(button instanceof HTMLElement)) return null;
        button.scrollIntoView({ block: "nearest" });
        const box = button.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })()
    `)) as DomRect | null;
    if (rect && rect.width > 0 && rect.height > 0) {
      await pointerClickAt(window, rect);
      await delay(50);
      return;
    }
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error("NavUser trigger missing");
}

async function waitForSignedOut(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = (await window.webContents
      .executeJavaScript(`
      (() => {
        const text = (document.body?.innerText ?? "").replace(/\\s+/g, " ");
        return {
          loggedOut: /\\bLog in\\b/.test(text) || /\\bLogged out\\b/.test(text),
        };
      })()
    `)
      .catch(() => null)) as { loggedOut: boolean } | null;
    if (state?.loggedOut) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`Sign out never left the app: ${body.slice(0, 2000)}`);
}

async function waitForMailboxGone(sqlitePath: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (
      !existsSync(sqlitePath) &&
      !existsSync(`${sqlitePath}-wal`) &&
      !existsSync(`${sqlitePath}-shm`)
    ) {
      return;
    }
    await delay(250);
  }
  throw new Error(`native sqlite still present at ${sqlitePath}`);
}

async function clickExactButton(window: BrowserWindow, name: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clicked = (await window.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll("button")].find((item) => {
          const label = (item.getAttribute("aria-label") ?? "").trim();
          const text = (item.innerText ?? "").replace(/\\s+/g, " ").trim();
          return label === ${JSON.stringify(name)} || text === ${JSON.stringify(name)};
        });
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
      })()
    `)) as boolean;
    if (clicked) return;
    await delay(50);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error(`${name} button missing`);
}

async function readInboxUnreadBadge(window: BrowserWindow) {
  return (await window.webContents.executeJavaScript(`
    (() => {
      const link = [...document.querySelectorAll("a")].find((item) => {
        const text = (item.innerText ?? "").replace(/\\s+/g, " ").trim();
        return /^Inbox(?: \\d+)?$/.test(text);
      });
      if (!link) return null;
      const text = (link.innerText ?? "").replace(/\\s+/g, " ").trim();
      const match = text.match(/^Inbox(?: (\\d+))?$/);
      return match?.[1] ? Number(match[1]) : 0;
    })()
  `)) as number | null;
}

async function waitForInboxUnreadBadge(
  window: BrowserWindow,
  matches: (count: number) => boolean,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const count = await readInboxUnreadBadge(window);
    if (count != null && matches(count)) return count;
    await delay(250);
  }
  const count = await readInboxUnreadBadge(window);
  throw new Error(`Inbox unread badge stayed at ${count}`);
}

async function providerUnarchive(
  window: BrowserWindow,
  accountId: string,
  threadId: string,
) {
  const ok = (await window.webContents.executeJavaScript(`
    fetch(${JSON.stringify(`/api/threads/${threadId}/unarchive`)}, {
      method: "POST",
      credentials: "include",
      headers: { "X-Email-Account-ID": ${JSON.stringify(accountId)} },
    }).then((response) => response.ok)
  `)) as boolean;
  if (!ok) throw new Error(`Provider unarchive failed for ${threadId}`);
}

async function clickToolbarButton(window: BrowserWindow, name: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clicked = (await window.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector(
          ${JSON.stringify(`button[aria-label="${name}"]`)},
        );
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
      })()
    `)) as boolean;
    if (clicked) return;
    await delay(50);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error(`${name} toolbar control missing`);
}

async function undoLastTriage(window: BrowserWindow) {
  const clicked = (await window.webContents.executeJavaScript(`
    (() => {
      const buttons = [...document.querySelectorAll("button")];
      const undo = buttons.find((item) =>
        /^Undo/.test((item.textContent ?? "").trim()),
      );
      if (!(undo instanceof HTMLElement)) return false;
      undo.click();
      return true;
    })()
  `)) as boolean;
  if (clicked) return;
  window.webContents.focus();
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Z" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Z" });
}

async function waitForHeading(window: BrowserWindow, name: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const visible = (await window.webContents.executeJavaScript(`
      [...document.querySelectorAll("h1, h2, h3")].some(
        (heading) => heading.textContent?.trim() === ${JSON.stringify(name)},
      )
    `)) as boolean;
    if (visible) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error(`heading ${name} missing`);
}

async function clickMoreActionsItem(window: BrowserWindow, label: string) {
  const moreRect = await waitForElementRect(
    window,
    'button[aria-label="More actions"]',
  );
  await pointerClickAt(window, moreRect);
  await delay(50);
  const itemRect = await waitForMenuItemRect(window, label);
  await pointerClickAt(window, itemRect);
}

async function waitForMenuItemRect(window: BrowserWindow, label: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rect = (await window.webContents.executeJavaScript(`
      (() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find(
          (entry) => {
            const text = (entry.textContent ?? "").replace(/\\s+/g, " ").trim();
            return text.startsWith(${JSON.stringify(label)});
          },
        );
        if (!(item instanceof HTMLElement)) return null;
        item.scrollIntoView({ block: "nearest" });
        const box = item.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })()
    `)) as DomRect | null;
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`${label} menu item missing: ${body.slice(0, 2000)}`);
}

async function applyPickerLabel(
  window: BrowserWindow,
  query: string,
  optionName: string,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const applied = (await window.webContents.executeJavaScript(`
      (() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
          (item) => (item.textContent ?? "").includes("Label conversations"),
        );
        if (!(dialog instanceof HTMLElement)) return { ok: false, step: "dialog" };
        const combobox =
          dialog.querySelector('[role="combobox"]') ??
          dialog.querySelector("input");
        if (!(combobox instanceof HTMLInputElement)) {
          return { ok: false, step: "combobox" };
        }
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(combobox, ${JSON.stringify(query)});
        combobox.dispatchEvent(new Event("input", { bubbles: true }));
        const option = [...dialog.querySelectorAll('[role="option"]')].find(
          (item) =>
            (item.textContent ?? "").replace(/\\s+/g, " ").trim() ===
            ${JSON.stringify(optionName)},
        );
        if (!(option instanceof HTMLElement)) return { ok: false, step: "option" };
        option.click();
        return { ok: true };
      })()
    `)) as { ok: boolean; step?: string };
    if (applied.ok) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error(`label picker never applied ${optionName}`);
}

async function openNamedMailbox(window: BrowserWindow, name: string) {
  let expandedMail = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const opened = (await window.webContents.executeJavaScript(`
      (() => {
        const link = [...document.querySelectorAll("a")].find((item) =>
          [...item.querySelectorAll("span")].some(
            (span) => span.textContent?.trim() === ${JSON.stringify(name)},
          ),
        );
        if (link instanceof HTMLElement) {
          link.click();
          return "opened";
        }
        return "missing";
      })()
    `)) as "opened" | "missing";
    if (opened === "opened") return;
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
  throw new Error(`${name} mailbox missing`);
}

async function waitForInspectSucceeded(
  window: BrowserWindow,
  expected: {
    kind: string;
    threadId: string;
    payload?: Record<string, unknown>;
  },
) {
  const kindMap: Record<string, string> = {
    archive: "archive",
    unarchive: "unarchive",
    trash: "trash",
    restore_from_trash: "untrash",
    set_membership: "set_membership",
  };
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = (await window.webContents.executeJavaScript(`
      (async () => {
        const inspect = window.__inboxZeroMailInspect;
        if (!inspect?.read) return { status: "missing" };
        const diagnostics = await inspect.read();
        const kindMap = ${JSON.stringify(kindMap)};
        const expected = ${JSON.stringify(expected)};
        const slug = expected.threadId.startsWith("thr_")
          ? expected.threadId.slice(4)
          : expected.threadId;
        const match = diagnostics?.commands
          ?.filter((command) => {
            const changeKind = command.change?.kind ?? command.kind;
            const mapped = kindMap[changeKind] ?? changeKind;
            if (mapped !== expected.kind) return false;
            const ids = command.conversationIds ?? [];
            const messages = command.messageIds ?? [];
            const threadOk =
              ids.includes(expected.threadId) ||
              messages.some(
                (messageId) =>
                  messageId.includes(expected.threadId) ||
                  messageId === "msg_" + slug ||
                  messageId.startsWith("msg_" + slug + "_"),
              );
            if (!threadOk) return false;
            if (!expected.payload) return true;
            return Object.entries(expected.payload).every(
              ([key, value]) => command.change?.[key] === value,
            );
          })
          .at(-1);
        return match
          ? { status: match.status, kind: match.change?.kind ?? match.kind }
          : { status: "missing" };
      })()
    `)) as { status?: string };
    if (result.status === "succeeded") return true;
    if (
      result.status === "failed" ||
      result.status === "cancelled" ||
      result.status === "needs_attention"
    ) {
      throw new Error(`hosted ${expected.kind} ${result.status}`);
    }
    await delay(500);
  }
  throw new Error(`hosted ${expected.kind} never reached succeeded`);
}

async function waitForInspectStatus(
  window: BrowserWindow,
  expected: {
    kind: string;
    threadId: string;
    statuses: string[];
  },
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = (await window.webContents.executeJavaScript(`
      (async () => {
        const inspect = window.__inboxZeroMailInspect;
        if (!inspect?.read) return { status: "missing" };
        const diagnostics = await inspect.read();
        const expected = ${JSON.stringify(expected)};
        const slug = expected.threadId.startsWith("thr_")
          ? expected.threadId.slice(4)
          : expected.threadId;
        const match = diagnostics?.commands
          ?.filter((command) => {
            const changeKind = command.change?.kind ?? command.kind;
            if (changeKind !== expected.kind && command.kind !== expected.kind) {
              return false;
            }
            const ids = command.conversationIds ?? [];
            const messages = command.messageIds ?? [];
            return (
              ids.includes(expected.threadId) ||
              messages.some(
                (messageId) =>
                  messageId.includes(expected.threadId) ||
                  messageId === "msg_" + slug ||
                  messageId.startsWith("msg_" + slug + "_"),
              )
            );
          })
          .at(-1);
        return match ? { status: match.status } : { status: "missing" };
      })()
    `)) as { status?: string };
    if (result.status && expected.statuses.includes(result.status)) {
      return result.status;
    }
    if (
      result.status === "failed" ||
      result.status === "cancelled" ||
      result.status === "needs_attention"
    ) {
      throw new Error(`hosted ${expected.kind} ${result.status}`);
    }
    await delay(500);
  }
  throw new Error(
    `hosted ${expected.kind} never reached ${expected.statuses.join("|")}`,
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
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
    if (clicked.ok) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(
    `Conversation missing for ${subject}: ${body.slice(0, 2000)}`,
  );
}

async function waitForThreadReader(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const visible = (await window.webContents.executeJavaScript(`
      Boolean(document.querySelector('[data-testid="thread-reader"]'))
    `)) as boolean;
    if (visible) return;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error("thread reader never opened");
}

async function clickMoreActionsStar(window: BrowserWindow) {
  const moreRect = await waitForElementRect(
    window,
    'button[aria-label="More actions"]',
  );
  await pointerClickAt(window, moreRect);
  await delay(50);
  const starRect = await waitForStarMenuItemRect(window);
  await pointerClickAt(window, starRect);
}

async function waitForElementRect(window: BrowserWindow, selector: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rect = (await window.webContents.executeJavaScript(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })()
    `)) as DomRect | null;
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  throw new Error(`${selector} missing`);
}

async function waitForStarMenuItemRect(window: BrowserWindow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rect = (await window.webContents.executeJavaScript(`
      (() => {
        const menu = [...document.querySelectorAll('[role="menu"]')].find(
          (item) =>
            [...item.querySelectorAll('[role="menuitem"]')].some((entry) => {
              const label = (entry.textContent ?? "").replace(/\\s+/g, " ").trim();
              return label.startsWith("Star") || label.startsWith("Unstar");
            }),
        );
        const star = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find(
          (item) => {
            const label = (item.textContent ?? "").replace(/\\s+/g, " ").trim();
            return label.startsWith("Star") && !label.startsWith("Starred");
          },
        );
        if (!(star instanceof HTMLElement)) return null;
        const box = star.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })()
    `)) as DomRect | null;
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    await delay(250);
  }
  await captureWindow(window, process.env.ELECTRON_SCREENSHOT_PATH);
  const body = await readBodyText(window);
  throw new Error(`Star control missing: ${body.slice(0, 2000)}`);
}

function pointerClickAt(window: BrowserWindow, rect: DomRect) {
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  window.webContents.sendInputEvent({ type: "mouseMove", x, y });
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
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
          '[data-testid="thread-reader"] [aria-label="Starred conversation"]',
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

async function waitForAssistantCursor(
  window: BrowserWindow,
  required: boolean,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const cursor = await readAssistantCursor(window);
    if (required ? Boolean(cursor) : true) return cursor;
    await delay(500);
  }
  throw new Error("hosted assistant cursor never stored");
}

async function readAssistantCursor(window: BrowserWindow) {
  return (await window.webContents.executeJavaScript(`
    (async () => {
      const inspect = window.__inboxZeroMailInspect;
      if (!inspect?.inspect) return null;
      const snapshot = await inspect.inspect();
      return snapshot?.accounts?.[0]?.assistantCursor ?? null;
    })()
  `)) as string | null;
}

async function waitForNativeRoleSubject(
  owner: Awaited<ReturnType<typeof createDesktopMailOwner>>,
  accountId: string,
  role: MailboxRole,
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
  role: MailboxRole,
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
  const deadline = Date.now() + HOSTED_IDLE_PROOF_TIMEOUT_MS;
  for (;;) {
    const visible = (await window.webContents.executeJavaScript(`
      [...document.querySelectorAll("h2")].some(
        (heading) =>
          heading.textContent === "Reconnect this account to continue syncing.",
      )
    `)) as boolean;
    if (visible) return;
    if (Date.now() >= deadline) break;
    await delay(HOSTED_PROOF_POLL_MS);
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

async function requestHostedSync(window: BrowserWindow) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = (await window.webContents.executeJavaScript(`
      (async () => {
        const inspect = window.__inboxZeroMailInspect;
        if (!inspect?.requestSync) return { status: "missing" };
        return await inspect.requestSync();
      })()
    `)) as { status?: string; code?: string };
    if (result.status !== "missing") return result;
    await delay(250);
  }
  throw new Error("hosted mail inspect requestSync missing");
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

type MailboxRole = "inbox" | "draft" | "sent" | "trash";

type DomRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BlockedAuthGate = {
  enabled: boolean;
  countCatchUp: boolean;
  resetOnce: boolean;
  resetFired: boolean;
  holdingOperations: boolean;
  heldOperations: number;
  operationsHold: Promise<void>;
  releaseOperations: () => void;
  changes: number;
  enumeration: number;
  bootstrap: number;
  assistantState: number;
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
