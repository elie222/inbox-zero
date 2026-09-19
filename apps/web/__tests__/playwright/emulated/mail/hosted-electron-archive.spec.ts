import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";

const THREAD_ID = "thr_playwright_archive";
const SUBJECT = "Archive Action Message";
const electronBin = join(
  process.cwd(),
  "../desktop/node_modules/electron/dist/electron",
);
const runner = join(
  process.cwd(),
  "../desktop/__tests__/mail-engine/run-hosted-electron-mail.mjs",
);

test.skip(!existsSync(electronBin), "Electron binary is not installed");

test("archives from hosted Next through desktop SQLite IPC", async ({
  page,
  baseURL,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!baseURL) throw new Error("Playwright baseURL is missing");
  if (!authFile) throw new Error("PLAYWRIGHT_AUTH_FILE is missing");

  const screenshotPath = testInfo.outputPath("hosted-electron-archive.png");
  await mkdir(dirname(screenshotPath), { recursive: true });

  const cleanupErrors: unknown[] = [];
  try {
    const payload = await launchHostedElectron({
      appUrl: baseURL,
      accountId: emailAccountId,
      storageState: authFile,
      screenshotPath,
    });
    expect(payload.url).toMatch(/^https?:/);
    expect(payload.url).not.toContain("file:");
    expect(payload.transport).toBe("desktop-ipc");
    expect(payload.sqliteExists).toBe(true);
    expect(payload.subjectsBefore?.some((text) => text.includes(SUBJECT))).toBe(
      true,
    );
    expect(payload.subjectsAfter?.some((text) => text.includes(SUBJECT))).toBe(
      false,
    );
    expect(payload.nativeInboxHasArchiveSubject).toBe(false);
    await copyArtifact(screenshotPath);
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

function launchHostedElectron(input: {
  appUrl: string;
  accountId: string;
  storageState: string;
  screenshotPath: string;
}) {
  return new Promise<HostedElectronPayload>((resolve, reject) => {
    const child = spawn("node", [runner], {
      cwd: join(process.cwd(), "../desktop"),
      env: {
        ...process.env,
        ELECTRON_APP_URL: input.appUrl,
        ELECTRON_ACCOUNT_ID: input.accountId,
        ELECTRON_STORAGE_STATE: input.storageState,
        ELECTRON_SCREENSHOT_PATH: input.screenshotPath,
        ELECTRON_ARCHIVE_SUBJECT: SUBJECT,
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
}

async function copyArtifact(screenshotPath: string) {
  try {
    await mkdir("/opt/cursor/artifacts", { recursive: true });
    await copyFile(
      screenshotPath,
      "/opt/cursor/artifacts/hosted-electron-archive.png",
    );
  } catch {
    // Evidence still lives on the Playwright output path.
  }
}

type HostedElectronPayload = {
  url?: string;
  transport?: string | null;
  sqliteExists?: boolean;
  subjectsBefore?: string[];
  subjectsAfter?: string[];
  nativeInboxHasArchiveSubject?: boolean;
};
