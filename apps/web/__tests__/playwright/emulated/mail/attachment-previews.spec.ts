import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("downloads opened attachment previews over the network", async ({
  page,
}, testInfo) => {
  const { conversations, emailAccountId } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();
  await expect(
    page.getByText("reader-preview.png", { exact: true }),
  ).toBeVisible();
  const downloadRequest = page.waitForRequest(
    (request) =>
      request.method() === "GET" &&
      request.url().includes("/attachment-content"),
  );
  const download = page.waitForEvent("download");
  await page
    .getByText("reader-preview.png", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Download" })
    .click();
  const savedFile = await download;
  expect(savedFile.suggestedFilename()).toBe("reader-preview.png");
  expect(await savedFile.failure()).toBeNull();
  const contentRequest = await downloadRequest;
  expect(contentRequest.method()).toBe("GET");
  expect(new URL(contentRequest.url()).pathname).toBe(
    `/api/mail/v1/accounts/${emailAccountId}/attachment-content`,
  );
  expect(contentRequest.headers()["x-email-account-id"]).toBe(emailAccountId);
  const savedPath = await savedFile.path();
  expect(savedPath).not.toBeNull();
  const savedBytes = await readFile(savedPath!);
  expect(savedBytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-network-attachment-preview",
  );
});

test("opens an attachment preview from its card", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Re: Reader Visual Message",
  ).click();
  await page
    .getByRole("button", { name: "Preview reader-preview.png" })
    .click();
  const dialog = page.getByRole("dialog", { name: "reader-preview.png" });
  await expect(
    dialog.getByRole("img", { name: "reader-preview.png" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("reader-preview.png");
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-attachment-preview-dialog",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
