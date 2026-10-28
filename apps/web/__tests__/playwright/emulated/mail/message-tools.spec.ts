import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { playwrightMailProvider } from "../mail-provider";
import { test } from "../playwright-test";
import { openMail } from "./mail-test-helpers";

const THREAD_ID = "thr_playwright_reader";
const SUBJECT = "Reader Navigation Message";

test("prints, downloads, shows the source of, and creates a rule from messages", async ({
  page,
}, testInfo) => {
  const { emailAccountId } = await openMail(page);
  await page.goto(`/${emailAccountId}/mail?thread-id=${THREAD_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: SUBJECT })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Create rule for sender" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "thread-actions-menu");
  await page.getByRole("menuitem", { name: "Print", exact: true }).click();
  const printFrame = page.locator("iframe[sandbox][aria-hidden='true']");
  await expect(printFrame).toHaveAttribute(
    "srcdoc",
    /First message in the reader conversation[\s\S]*A second message proves/,
  );

  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Create rule for sender" }).click();
  const ruleDialog = page.getByRole("dialog", { name: "Create Rule" });
  await expect(ruleDialog.locator("input[name$='.from']")).toHaveValue(
    "dana@example.com",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "create-rule-for-sender");
  await page.keyboard.press("Escape");
  await expect(ruleDialog).toBeHidden();

  // The Microsoft emulator gains `/messages/{id}/$value` in a later release.
  if (playwrightMailProvider === "microsoft") return;

  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reader_1"]',
  );
  const openMessageMenu = async () => {
    await message.hover();
    await message
      .getByRole("button", { name: "More message actions", exact: true })
      .click();
  };

  await openMessageMenu();
  await expect(
    page.getByRole("menuitem", { name: "Show original" }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "message-actions-menu");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download message" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${SUBJECT}.eml`);
  const downloadPath = await download.path();
  expect(await readFile(downloadPath, "utf8")).toMatch(
    new RegExp(`^Subject: ${SUBJECT}\\r?$`, "m"),
  );

  await openMessageMenu();
  await page.getByRole("menuitem", { name: "Show original" }).click();
  const sourceDialog = page.getByRole("dialog", { name: "Original message" });
  await expect(
    sourceDialog.getByText(`Subject: ${SUBJECT}`, { exact: false }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "show-original");
});
