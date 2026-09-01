import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("switches between list, split, and focused reading layouts", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  const emptyReader = page.getByText("Nothing selected", { exact: true });
  await expect(emptyReader).toBeHidden();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-list-layout");

  await page.getByRole("button", { name: "Switch list or split view" }).click();
  await expect(emptyReader).toBeVisible();
  await expect(conversations).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-split-layout");

  await conversationWithSubject(
    page,
    conversations,
    "Project Label Message",
  ).click();
  await expect(
    page.getByRole("heading", { name: "Project Label Message" }),
  ).toBeVisible();
  const messageBody = page
    .locator("pre")
    .getByText("This conversation is visible in the seeded project label.", {
      exact: true,
    });
  await expect(messageBody).toBeVisible();
  await expect(conversations).toBeVisible();
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "mail-selected-conversation-layout",
  );

  await page.getByRole("button", { name: /^Focus mode/ }).click();
  await expect(conversations).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Exit focus mode/ }),
  ).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-focus-layout");

  await page.getByRole("button", { name: /^Exit focus mode/ }).click();
  await expect(conversations).toBeVisible();
  await page.getByRole("button", { name: "Switch list or split view" }).click();
  await page.keyboard.press("Escape");
  await expect(conversations).toBeVisible();
});
