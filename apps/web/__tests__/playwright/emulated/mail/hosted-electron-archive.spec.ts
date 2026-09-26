import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "@playwright/test";
import type { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { withClient, insertInboxMailInConversation } from "./mail-test-helpers";
import {
  ARCHIVE_SUBJECT,
  HIDDEN_SUBJECT,
  launchHostedElectron,
  requireElectron,
  startHostedElectron,
  waitForHostedElectronReady,
} from "./hosted-electron-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const DRAFT_SUBJECT = "Hosted desktop draft example";
const DISCARD_SUBJECT = "Hosted desktop discard example";
const STAR_SUBJECT = "Second Unread Command Message";
const STAR_THREAD_ID = "thr_playwright_3";
const ASSISTANT_THREAD_ID = "thr_playwright_archive";
const ASSISTANT_RULE_ID = "playwright-mail-assistant-archive-rule";
const ASSISTANT_EXECUTED_RULE_ID =
  "playwright-mail-assistant-archive-execution";

// The send proof waits out the 30-second undo window, so it runs in its own
// spec, with its own emulator request quota: hosted-electron-send.spec.ts.
requireElectron();

test("searches then archives from hosted Next through desktop SQLite IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-archive.png");
  const searchScreenshotPath = testInfo.outputPath(
    "hosted-electron-search.png",
  );
  await mkdir(dirname(screenshotPath), { recursive: true });

  const cleanupErrors: unknown[] = [];
  try {
    const payload = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
      searchScreenshotPath,
    });
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(
      payload.subjectsBefore?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(true);
    expect(
      payload.subjectsSearched?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(true);
    expect(
      payload.subjectsSearched?.some((text) => text.includes(HIDDEN_SUBJECT)),
    ).toBe(false);
    expect(payload.searchHidHiddenSubject).toBe(true);
    expect(
      payload.subjectsAfter?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(false);
    expect(payload.nativeInboxHasArchiveSubject).toBe(false);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        sqliteExists: payload.sqliteExists,
        nativeInboxHasArchiveSubject: payload.nativeInboxHasArchiveSubject,
        hadSubjectBefore: payload.subjectsBefore?.some((text) =>
          text.includes(ARCHIVE_SUBJECT),
        ),
        searchMatched: payload.subjectsSearched?.some((text) =>
          text.includes(ARCHIVE_SUBJECT),
        ),
        searchHidHiddenSubject: payload.searchHidHiddenSubject,
        hadSubjectAfter: payload.subjectsAfter?.some((text) =>
          text.includes(ARCHIVE_SUBJECT),
        ),
      }),
    });
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
  }
  expect(cleanupErrors).toEqual([]);
});

test("saves a compose draft from hosted Next through desktop SQLite IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-compose.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "compose",
    draftSubject: DRAFT_SUBJECT,
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.sqliteExists).toBe(true);
  expect(payload.proof).toBe("compose");
  expect(
    payload.draftSubjects?.some((text) => text.includes(DRAFT_SUBJECT)),
  ).toBe(true);
  expect(payload.nativeDraftHasSubject).toBe(true);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      sqliteExists: payload.sqliteExists,
      proof: payload.proof,
      nativeDraftHasSubject: payload.nativeDraftHasSubject,
      hadDraftSubject: payload.draftSubjects?.some((text) =>
        text.includes(DRAFT_SUBJECT),
      ),
    }),
  });
});

test("reconnects hosted Next from blocked_auth catch-up through desktop IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-reconnect.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "reconnect",
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.url).toContain("reconnect=blocked");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.sqliteExists).toBe(true);
  expect(payload.proof).toBe("reconnect");
  expect(payload.connection).toBe("blocked_auth");
  expect(payload.headingVisible).toBe(true);
  expect(payload.changeRequests).toBeGreaterThan(0);
  expect(payload.enumerationRequests).toBe(0);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      sqliteExists: payload.sqliteExists,
      proof: payload.proof,
      connection: payload.connection,
      headingVisible: payload.headingVisible,
      changeRequests: payload.changeRequests,
      enumerationRequests: payload.enumerationRequests,
    }),
  });
});

test("discards a compose draft from hosted Next through desktop SQLite IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-discard.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "discard",
    discardSubject: DISCARD_SUBJECT,
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.sqliteExists).toBe(true);
  expect(payload.proof).toBe("discard");
  expect(payload.nativeDraftHadDiscardSubject).toBe(true);
  expect(payload.nativeDraftHasDiscardSubject).toBe(false);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      sqliteExists: payload.sqliteExists,
      proof: payload.proof,
      nativeDraftHadDiscardSubject: payload.nativeDraftHadDiscardSubject,
      nativeDraftHasDiscardSubject: payload.nativeDraftHasDiscardSubject,
    }),
  });
});

test("stars a conversation from hosted Next through desktop SQLite IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-star.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "star",
    starSubject: STAR_SUBJECT,
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.sqliteExists).toBe(true);
  expect(payload.proof).toBe("star");
  expect(payload.readerStarred).toBe(true);
  expect(payload.starSucceeded).toBe(true);
  expect(payload.nativeStarredHasSubject).toBe(true);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      sqliteExists: payload.sqliteExists,
      proof: payload.proof,
      readerStarred: payload.readerStarred,
      starSucceeded: payload.starSucceeded,
      nativeStarredHasSubject: payload.nativeStarredHasSubject,
    }),
  });
});

test("applies assistant archive after hosted Electron was stopped", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-assistant.png");
  await mkdir(dirname(screenshotPath), { recursive: true });
  const userData = await mkdtemp(join(tmpdir(), "electron-hosted-assistant-"));
  const cleanupErrors: unknown[] = [];

  try {
    const baseline = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
      proof: "assistant-baseline",
      userData,
    });
    expect(baseline.transport).toBe("desktop-ipc");
    expect(
      baseline.subjectsBefore?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(true);
    expect(baseline.nativeInboxHasArchiveSubject).toBe(true);

    await seedAssistantArchive(emailAccountId);
    const archived = await page.request.post(
      `/api/threads/${ASSISTANT_THREAD_ID}/archive`,
      { headers: { "X-Email-Account-ID": emailAccountId } },
    );
    expect(archived.ok()).toBe(true);

    const reopened = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
      proof: "assistant-reopen",
      userData,
    });
    expect(reopened.transport).toBe("desktop-ipc");
    expect(
      reopened.subjectsAfter?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(false);
    expect(reopened.nativeInboxHasArchiveSubject).toBe(false);
    expect(reopened.assistantCursor).toMatch(/\S/);
    expect(reopened.assistantStateRequests).toBeGreaterThan(0);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: reopened.url,
        transport: reopened.transport,
        proof: reopened.proof,
        nativeInboxHasArchiveSubject: reopened.nativeInboxHasArchiveSubject,
        assistantCursor: reopened.assistantCursor,
        assistantStateRequests: reopened.assistantStateRequests,
      }),
    });
  } finally {
    await page.request
      .post(`/api/threads/${ASSISTANT_THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    await cleanupAssistantArchive().catch((error) => {
      cleanupErrors.push(error);
    });
    await rm(userData, { recursive: true, force: true });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("rebuilds hosted desktop mail after a reset_required catch-up cursor", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath(
    "hosted-electron-cursor-reset.png",
  );
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "cursor-reset",
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.sqliteExists).toBe(true);
  expect(payload.proof).toBe("cursor-reset");
  expect(payload.resetFired).toBe(true);
  expect(payload.changeRequests).toBeGreaterThan(0);
  expect(payload.bootstrapRequests).toBeGreaterThan(0);
  expect(payload.enumerationRequests).toBeGreaterThan(0);
  expect(payload.nativeInboxHasArchiveSubject).toBe(true);
  expect(
    payload.subjectsAfter?.some((text) => text.includes(ARCHIVE_SUBJECT)),
  ).toBe(true);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      proof: payload.proof,
      resetFired: payload.resetFired,
      changeRequests: payload.changeRequests,
      bootstrapRequests: payload.bootstrapRequests,
      enumerationRequests: payload.enumerationRequests,
      nativeInboxHasArchiveSubject: payload.nativeInboxHasArchiveSubject,
    }),
  });
});

test("hides an externally archived conversation through desktop idle catch-up", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-missed-hint.png");
  await mkdir(dirname(screenshotPath), { recursive: true });
  const userData = await mkdtemp(
    join(tmpdir(), "electron-hosted-missed-hint-"),
  );
  const readyPath = join(userData, "electron-ready");
  const cleanupErrors: unknown[] = [];
  const session = startHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "missed-hint",
    userData,
    readyPath,
  });

  try {
    await waitForHostedElectronReady(readyPath, session.done);
    const archived = await page.request.post(
      `/api/threads/${THREAD_ID}/archive`,
      {
        headers: { "X-Email-Account-ID": emailAccountId },
      },
    );
    expect(archived.ok()).toBe(true);
    const payload = await session.done;
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(payload.proof).toBe("missed-hint");
    expect(payload.changeRequests).toBeGreaterThan(0);
    expect(payload.bootstrapRequests).toBe(0);
    expect(payload.enumerationRequests).toBe(0);
    expect(payload.nativeInboxHasArchiveSubject).toBe(false);
    expect(
      payload.subjectsBefore?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(true);
    expect(
      payload.subjectsAfter?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(false);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        proof: payload.proof,
        changeRequests: payload.changeRequests,
        bootstrapRequests: payload.bootstrapRequests,
        enumerationRequests: payload.enumerationRequests,
        nativeInboxHasArchiveSubject: payload.nativeInboxHasArchiveSubject,
      }),
    });
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    await session.done.catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("archives two conversations, restores trash, and labels through desktop IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-bulk.png");
  await mkdir(dirname(screenshotPath), { recursive: true });
  const cleanupErrors: unknown[] = [];

  try {
    const payload = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
      proof: "bulk",
    });
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(payload.proof).toBe("bulk");
    expect(payload.bulkArchived).toBe(true);
    expect(payload.bulkUndone).toBe(true);
    expect(payload.trashRestored).toBe(true);
    expect(payload.labelSucceeded).toBe(true);
    expect(payload.nativeInboxHasBulkSubjects).toBe(true);
    expect(payload.nativeTrashHasDeleteSubject).toBe(false);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        proof: payload.proof,
        bulkArchived: payload.bulkArchived,
        bulkUndone: payload.bulkUndone,
        trashRestored: payload.trashRestored,
        labelSucceeded: payload.labelSucceeded,
      }),
    });
  } finally {
    await Promise.all(
      ["thr_playwright_1", "thr_playwright_2"].map((threadId) =>
        page.request
          .post(`/api/threads/${threadId}/unarchive`, {
            headers: { "X-Email-Account-ID": emailAccountId },
          })
          .then((response) => expect(response.ok()).toBe(true))
          .catch((error) => {
            cleanupErrors.push(error);
          }),
      ),
    );
    await page.request
      .post("/api/threads/thr_playwright_delete/untrash", {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("keeps a queued archive hidden after a hosted Electron UI restart", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath(
    "hosted-electron-queued-restart.png",
  );
  await mkdir(dirname(screenshotPath), { recursive: true });
  const cleanupErrors: unknown[] = [];

  try {
    const payload = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
      proof: "queued-restart",
    });
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(payload.proof).toBe("queued-restart");
    expect(payload.heldOperations).toBeGreaterThan(0);
    expect(payload.queuedBeforeReload).toMatch(
      /^(queued|preparing|executing|verifying|uncertain|retry_wait)$/,
    );
    expect(payload.queuedAfterReload).toMatch(
      /^(queued|preparing|executing|verifying|uncertain|retry_wait)$/,
    );
    expect(payload.succeededAfterRelease).toBe(true);
    expect(payload.hiddenAfterReload).toBe(true);
    expect(payload.nativeInboxHasArchiveSubject).toBe(false);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        proof: payload.proof,
        heldOperations: payload.heldOperations,
        queuedBeforeReload: payload.queuedBeforeReload,
        queuedAfterReload: payload.queuedAfterReload,
        succeededAfterRelease: payload.succeededAfterRelease,
        hiddenAfterReload: payload.hiddenAfterReload,
        nativeInboxHasArchiveSubject: payload.nativeInboxHasArchiveSubject,
      }),
    });
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("drops Inbox and Unread counts when an unread conversation is archived through desktop IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  // The earlier reader proof marks this conversation read. Seed an unread
  // arrival so this assertion does not depend on the order of other proofs.
  await insertInboxMailInConversation(page, {
    threadId: STAR_THREAD_ID,
    messageId: "msg_playwright_3",
    subject: STAR_SUBJECT,
    from: "Erin Example <erin@example.com>",
  });

  const screenshotPath = testInfo.outputPath(
    "hosted-electron-inbox-counts.png",
  );
  await mkdir(dirname(screenshotPath), { recursive: true });
  const cleanupErrors: unknown[] = [];

  try {
    const payload = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
      proof: "inbox-counts",
    });
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(payload.proof).toBe("inbox-counts");
    expect(payload.inboxUnreadBefore).toBeGreaterThan(0);
    expect(payload.inboxUnreadAfterArchive).toBe(
      (payload.inboxUnreadBefore ?? 0) - 1,
    );
    expect(payload.inboxUnreadAfterRestore).toBe(payload.inboxUnreadBefore);
    expect(payload.unreadHiddenAfterArchive).toBe(true);
    expect(payload.unreadVisibleAfterRestore).toBe(true);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        proof: payload.proof,
        inboxUnreadBefore: payload.inboxUnreadBefore,
        inboxUnreadAfterArchive: payload.inboxUnreadAfterArchive,
        inboxUnreadAfterRestore: payload.inboxUnreadAfterRestore,
      }),
    });
  } finally {
    await page.request
      .post(`/api/threads/${STAR_THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("returns an archived conversation when new mail arrives through desktop IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath(
    "hosted-electron-archive-new-mail.png",
  );
  await mkdir(dirname(screenshotPath), { recursive: true });
  const userData = await mkdtemp(
    join(tmpdir(), "electron-hosted-archive-new-mail-"),
  );
  const readyPath = join(userData, "electron-ready");
  const cleanupErrors: unknown[] = [];
  const session = startHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "archive-new-mail",
    userData,
    readyPath,
  });

  try {
    await waitForHostedElectronReady(readyPath, session.done);
    await insertInboxMailInConversation(page, {
      threadId: THREAD_ID,
      messageId: "msg_playwright_archive",
      subject: ARCHIVE_SUBJECT,
      from: "Erin Example <erin@example.com>",
    });
    const payload = await session.done;
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(payload.proof).toBe("archive-new-mail");
    expect(payload.archiveSucceeded).toBe(true);
    expect(payload.changeRequests).toBeGreaterThan(0);
    expect(payload.enumerationRequests).toBe(0);
    expect(payload.nativeInboxHasArchiveSubject).toBe(true);
    expect(
      payload.subjectsBefore?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(true);
    expect(
      payload.subjectsAfterArchive?.some((text) =>
        text.includes(ARCHIVE_SUBJECT),
      ),
    ).toBe(false);
    expect(
      payload.subjectsAfter?.some((text) => text.includes(ARCHIVE_SUBJECT)),
    ).toBe(true);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        proof: payload.proof,
        archiveSucceeded: payload.archiveSucceeded,
        changeRequests: payload.changeRequests,
        enumerationRequests: payload.enumerationRequests,
        nativeInboxHasArchiveSubject: payload.nativeInboxHasArchiveSubject,
      }),
    });
  } finally {
    await page.request
      .post(`/api/threads/${THREAD_ID}/unarchive`, {
        headers: { "X-Email-Account-ID": emailAccountId },
      })
      .then((response) => expect(response.ok()).toBe(true))
      .catch((error) => {
        cleanupErrors.push(error);
      });
    await session.done.catch(() => undefined);
    await rm(userData, { recursive: true, force: true });
    for (const error of cleanupErrors) {
      testInfo.annotations.push({
        type: "cleanup-error",
        description: String(error),
      });
    }
  }
  expect(cleanupErrors).toEqual([]);
});

test("wipes native sqlite when Sign out is used through desktop IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-sign-out.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "sign-out",
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.proof).toBe("sign-out");
  expect(payload.sqliteExistsBefore).toBe(true);
  expect(payload.sqliteExists).toBe(false);
  expect(payload.sqliteExistsAfter).toBe(false);
  expect(payload.sqliteWalExistsAfter).toBe(false);
  expect(payload.sqliteShmExistsAfter).toBe(false);
  expect(payload.signedOut).toBe(true);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      proof: payload.proof,
      sqliteExistsBefore: payload.sqliteExistsBefore,
      sqliteExists: payload.sqliteExists,
      sqliteWalExists: payload.sqliteWalExists,
      sqliteShmExists: payload.sqliteShmExists,
    }),
  });
});

async function seedAssistantArchive(emailAccountId: string) {
  await withClient(async (client) => {
    await deleteAssistantArchive(client);
    await client.query(
      `INSERT INTO "Rule"
         (id, name, enabled, automate, "runOnThreads", instructions,
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, true, true, false, $3, $4,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        ASSISTANT_RULE_ID,
        "Playwright mail assistant archive",
        "Archive routine project updates",
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "ExecutedRule"
         (id, "threadId", "messageId", status, automated, reason, "ruleId",
          "emailAccountId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'APPLIED', true, $4, $5, $6,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        ASSISTANT_EXECUTED_RULE_ID,
        ASSISTANT_THREAD_ID,
        "msg_playwright_archive",
        "Assistant archived while the mail client was stopped.",
        ASSISTANT_RULE_ID,
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "ExecutedAction"
         (id, type, "executionStatus", "executedAt", "executedRuleId",
          "createdAt", "updatedAt")
       VALUES ($1, 'ARCHIVE', 'SUCCEEDED', CURRENT_TIMESTAMP, $2,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`${ASSISTANT_EXECUTED_RULE_ID}-archive`, ASSISTANT_EXECUTED_RULE_ID],
    );
  });
}

async function cleanupAssistantArchive() {
  await withClient(deleteAssistantArchive);
}

async function deleteAssistantArchive(client: Client) {
  await client.query(
    `DELETE FROM "ExecutedRule" WHERE id = $1 OR "ruleId" = $2`,
    [ASSISTANT_EXECUTED_RULE_ID, ASSISTANT_RULE_ID],
  );
  await client.query(`DELETE FROM "Rule" WHERE id = $1`, [ASSISTANT_RULE_ID]);
}
