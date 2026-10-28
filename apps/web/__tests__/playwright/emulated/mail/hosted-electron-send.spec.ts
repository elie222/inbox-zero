import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  launchHostedElectron,
  requireElectron,
} from "./hosted-electron-test-helpers";

const SEND_SUBJECT = "Hosted desktop send example";

requireElectron();

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
});
