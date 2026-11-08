import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("updates the draft indicator at once after deletion and retains remaining drafts", async ({
  page,
}, testInfo) => {
  // Without background sync, only the local discard can update the list.
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { conversations } = await openMail(page);
  if (
    !(await page.getByText("Nothing selected", { exact: true }).isVisible())
  ) {
    await page
      .getByRole("button", { name: "Switch list or split view" })
      .click();
  }
  const row = conversationWithSubject(
    page,
    conversations,
    "Draft deletion example",
  );
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await row.click();
  const discardButtons = page.getByRole("button", {
    name: "Discard draft",
    exact: true,
  });
  await expect(discardButtons).toHaveCount(2);
  const discard = discardButtons.first();
  await expect(discard).toBeVisible({ timeout: 60_000 });
  // A click while the lazily loaded editors mount can be lost.
  const editors = page.getByRole("textbox", { name: "Email message" });
  await expect(editors.nth(0)).toContainText("First draft reply.");
  await expect(editors.nth(1)).toContainText("Second draft reply.");
  await discard.click();
  await expect(discardButtons).toHaveCount(1);
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(discardButtons).toHaveCount(0);
  await expect(row.getByText("Draft", { exact: true })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "deleted-draft-indicator");
});
