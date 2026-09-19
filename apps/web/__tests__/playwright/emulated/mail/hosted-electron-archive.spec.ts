import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect } from "@playwright/test";
import type { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { withClient } from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const SUBJECT = "Archive Action Message";
const HIDDEN_SUBJECT = "Keyboard Navigation Message";
const DRAFT_SUBJECT = "Hosted desktop draft example";
const DISCARD_SUBJECT = "Hosted desktop discard example";
const SEND_SUBJECT = "Hosted desktop send example";
const STAR_SUBJECT = "Second Unread Command Message";
const ASSISTANT_THREAD_ID = "thr_playwright_archive";
const ASSISTANT_RULE_ID = "playwright-mail-assistant-archive-rule";
const ASSISTANT_EXECUTED_RULE_ID =
  "playwright-mail-assistant-archive-execution";
const electronBin = join(
  process.cwd(),
  "../desktop/node_modules/electron/dist/electron",
);
const runner = join(
  process.cwd(),
  "../desktop/__tests__/mail-engine/run-hosted-electron-mail.mjs",
);

test.skip(!existsSync(electronBin), "Electron binary is not installed");

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
    expect(payload.subjectsBefore?.some((text) => text.includes(SUBJECT))).toBe(
      true,
    );
    expect(
      payload.subjectsSearched?.some((text) => text.includes(SUBJECT)),
    ).toBe(true);
    expect(
      payload.subjectsSearched?.some((text) => text.includes(HIDDEN_SUBJECT)),
    ).toBe(false);
    expect(payload.searchHidHiddenSubject).toBe(true);
    expect(payload.subjectsAfter?.some((text) => text.includes(SUBJECT))).toBe(
      false,
    );
    expect(payload.nativeInboxHasArchiveSubject).toBe(false);
    testInfo.annotations.push({
      type: "hosted-electron-payload",
      description: JSON.stringify({
        url: payload.url,
        transport: payload.transport,
        sqliteExists: payload.sqliteExists,
        nativeInboxHasArchiveSubject: payload.nativeInboxHasArchiveSubject,
        hadSubjectBefore: payload.subjectsBefore?.some((text) =>
          text.includes(SUBJECT),
        ),
        searchMatched: payload.subjectsSearched?.some((text) =>
          text.includes(SUBJECT),
        ),
        searchHidHiddenSubject: payload.searchHidHiddenSubject,
        hadSubjectAfter: payload.subjectsAfter?.some((text) =>
          text.includes(SUBJECT),
        ),
      }),
    });
    await copyArtifact(screenshotPath, searchScreenshotPath, payload);
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
  await copyComposeArtifact(screenshotPath, payload);
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
  await copyReconnectArtifact(screenshotPath, payload);
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
  await copySendDiscardArtifact(screenshotPath, payload);
});

test("sends a compose draft from hosted Next through desktop SQLite IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-send.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const payload = await launchHostedElectron({
    appUrl: baseURL,
    accountId: emailAccountId,
    storageState: authFile,
    screenshotPath,
    proof: "send",
    sendSubject: SEND_SUBJECT,
  });
  expect(payload.url).toMatch(/^https?:/);
  expect(payload.url).not.toContain("file:");
  expect(payload.transport).toBe("desktop-ipc");
  expect(payload.sqliteExists).toBe(true);
  expect(payload.proof).toBe("send");
  expect(payload.sendSucceeded).toBe(true);
  expect(payload.nativeDraftHasSendSubject).toBe(false);
  expect(payload.nativeSentHasSendSubject).toBe(true);
  expect(
    payload.sentSubjects?.some((text) => text.includes(SEND_SUBJECT)),
  ).toBe(true);
  testInfo.annotations.push({
    type: "hosted-electron-payload",
    description: JSON.stringify({
      url: payload.url,
      transport: payload.transport,
      sqliteExists: payload.sqliteExists,
      proof: payload.proof,
      sendSucceeded: payload.sendSucceeded,
      nativeDraftHasSendSubject: payload.nativeDraftHasSendSubject,
      nativeSentHasSendSubject: payload.nativeSentHasSendSubject,
      hadSentSubject: payload.sentSubjects?.some((text) =>
        text.includes(SEND_SUBJECT),
      ),
    }),
  });
  await copySendArtifact(screenshotPath, payload);
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
  await copyStarArtifact(screenshotPath, payload);
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
      baseline.subjectsBefore?.some((text) => text.includes(SUBJECT)),
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
    expect(reopened.subjectsAfter?.some((text) => text.includes(SUBJECT))).toBe(
      false,
    );
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
    await copyAssistantArtifact(screenshotPath, reopened);
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
  expect(payload.subjectsAfter?.some((text) => text.includes(SUBJECT))).toBe(
    true,
  );
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
  await copyCatchUpArtifact(
    screenshotPath,
    payload,
    "hosted-electron-cursor-reset",
  );
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
    expect(payload.subjectsBefore?.some((text) => text.includes(SUBJECT))).toBe(
      true,
    );
    expect(payload.subjectsAfter?.some((text) => text.includes(SUBJECT))).toBe(
      false,
    );
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
    await copyCatchUpArtifact(
      screenshotPath,
      payload,
      "hosted-electron-missed-hint",
    );
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

function launchHostedElectron(input: {
  appUrl: string;
  accountId: string;
  storageState: string;
  screenshotPath: string;
  searchScreenshotPath?: string;
  proof?:
    | "search-archive"
    | "compose"
    | "reconnect"
    | "discard"
    | "send"
    | "star"
    | "assistant-baseline"
    | "assistant-reopen"
    | "missed-hint"
    | "cursor-reset";
  draftSubject?: string;
  discardSubject?: string;
  sendSubject?: string;
  starSubject?: string;
  userData?: string;
  readyPath?: string;
}) {
  return startHostedElectron(input).done;
}

function startHostedElectron(
  input: Parameters<typeof launchHostedElectron>[0],
) {
  const done = new Promise<HostedElectronPayload>((resolve, reject) => {
    const child = spawn("node", [runner], {
      cwd: join(process.cwd(), "../desktop"),
      env: {
        ...process.env,
        ELECTRON_APP_URL: input.appUrl,
        ELECTRON_ACCOUNT_ID: input.accountId,
        ELECTRON_STORAGE_STATE: input.storageState,
        ELECTRON_SCREENSHOT_PATH: input.screenshotPath,
        ...(input.searchScreenshotPath
          ? { ELECTRON_SEARCH_SCREENSHOT_PATH: input.searchScreenshotPath }
          : {}),
        ELECTRON_ARCHIVE_SUBJECT: SUBJECT,
        ELECTRON_SEARCH_HIDDEN: HIDDEN_SUBJECT,
        ...(input.proof ? { ELECTRON_PROOF: input.proof } : {}),
        ...(input.draftSubject
          ? { ELECTRON_DRAFT_SUBJECT: input.draftSubject }
          : {}),
        ...(input.discardSubject
          ? { ELECTRON_DISCARD_SUBJECT: input.discardSubject }
          : {}),
        ...(input.sendSubject
          ? { ELECTRON_SEND_SUBJECT: input.sendSubject }
          : {}),
        ...(input.starSubject
          ? { ELECTRON_STAR_SUBJECT: input.starSubject }
          : {}),
        ...(input.userData ? { ELECTRON_USER_DATA: input.userData } : {}),
        ...(input.readyPath ? { ELECTRON_READY_PATH: input.readyPath } : {}),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `hosted electron runner exited ${code}\n${stdout}\n${stderr}`,
          ),
        );
        return;
      }
      const line = stdout
        .split("\n")
        .find((item) => item.startsWith("ELECTRON_HOSTED_MAIL "));
      try {
        resolve(
          JSON.parse(line?.slice("ELECTRON_HOSTED_MAIL ".length) ?? "{}"),
        );
      } catch (error) {
        reject(
          new Error(
            `hosted electron payload was not JSON\n${stdout}\n${String(error)}`,
          ),
        );
      }
    });
  });
  return { done };
}

async function waitForHostedElectronReady(
  readyPath: string,
  done: Promise<HostedElectronPayload>,
) {
  const ready = (async () => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (existsSync(readyPath)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`hosted electron never wrote ${readyPath}`);
  })();
  const winner = await Promise.race([
    ready.then(() => "ready" as const),
    done.then((payload) => payload),
  ]);
  if (winner === "ready") return;
  throw new Error(
    `hosted electron exited before ready: ${JSON.stringify(winner)}`,
  );
}

async function copyStarArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-star.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-star.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copyAssistantArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-assistant.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-assistant.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copySendArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-send.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-send.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copySendDiscardArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-discard.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-discard.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copyCatchUpArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
  name: string,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(screenshotPath, `/opt/cursor/artifacts/${name}.png`);
    await writeFile(
      `/opt/cursor/artifacts/${name}.json`,
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copyReconnectArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-reconnect.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-reconnect.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copyComposeArtifact(
  screenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-compose.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-compose.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

async function copyArtifact(
  screenshotPath: string,
  searchScreenshotPath: string,
  payload: HostedElectronPayload,
) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-archive.png",
    );
    await copyFile(
      searchScreenshotPath,
      "/opt/cursor/artifacts/hosted-electron-search.png",
    );
    await writeFile(
      "/opt/cursor/artifacts/hosted-electron-archive.json",
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

type HostedElectronPayload = {
  url?: string;
  transport?: string | null;
  sqliteExists?: boolean;
  proof?: string;
  subjectsBefore?: string[];
  subjectsSearched?: string[];
  searchHidHiddenSubject?: boolean;
  subjectsAfter?: string[];
  nativeInboxHasArchiveSubject?: boolean;
  draftSubjects?: string[];
  nativeDraftHasSubject?: boolean;
  connection?: string | null;
  changeRequests?: number;
  enumerationRequests?: number;
  reconnectUrl?: string;
  headingVisible?: boolean;
  discardSubject?: string;
  sendSubject?: string;
  discardedDraftSubjects?: string[];
  nativeDraftHadDiscardSubject?: boolean;
  nativeDraftHasDiscardSubject?: boolean;
  sendSucceeded?: boolean;
  nativeDraftHasSendSubject?: boolean;
  nativeSentHasSendSubject?: boolean;
  sentSubjects?: string[];
  starSubject?: string;
  readerStarred?: boolean;
  starSucceeded?: boolean;
  nativeStarredHasSubject?: boolean;
  assistantCursor?: string | null;
  assistantStateRequests?: number;
  bootstrapRequests?: number;
  resetFired?: boolean;
};

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
