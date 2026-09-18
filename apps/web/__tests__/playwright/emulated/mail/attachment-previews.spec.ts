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
  const download = page.waitForEvent("download");
  await page
    .getByText("reader-preview.png", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Download" })
    .click();
  const savedFile = await download;
  expect(savedFile.suggestedFilename()).toBe("reader-preview.png");
  expect(await savedFile.failure()).toBeNull();
  expect(new URL(savedFile.url()).searchParams.get("emailAccountId")).toBe(
    emailAccountId,
  );
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
