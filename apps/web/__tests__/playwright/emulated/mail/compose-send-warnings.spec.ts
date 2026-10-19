import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";
import { clearWorkflowMailboxDrafts, openMail } from "./mail-test-helpers";

test.beforeEach(async ({ page }) => {
  await clearWorkflowMailboxDrafts(page);
});

test("warns before sending a message that mentions a missing attachment and a placeholder", async ({
  page,
}, testInfo) => {
  await openMail(page);

  await page.getByRole("button", { name: /^Compose/ }).click();
  const dialog = page.getByRole("dialog", { name: "New Message" });
  await dialog
    .getByRole("combobox", { name: "To" })
    .fill("recipient@example.com");
  await dialog
    .getByPlaceholder("Subject")
    .fill(`Playwright Send Warnings ${testInfo.retry}`);
  await dialog
    .locator("[contenteditable='true']")
    .pressSequentially("I've attached the quote for [company name].");
  await dialog.getByRole("button", { exact: true, name: "Send" }).click();

  const warning = page.getByRole("alertdialog", { name: "Send anyway?" });
  await expect(warning).toContainText(
    "You mention an attachment, but nothing is attached.",
  );
  await expect(warning).toContainText(
    "There's an unfilled placeholder: [company name]",
  );
  await capturePlaywrightCheckpoint(page, testInfo, "send-warnings-dialog");

  await warning.getByRole("button", { name: "Go back" }).click();
  await expect(warning).toBeHidden();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { exact: true, name: "Send" }).click();
  await warning.getByRole("button", { name: "Send anyway" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Email sent!", { exact: true })).toBeVisible();
});
