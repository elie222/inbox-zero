import { expect } from "@playwright/test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { isMicrosoftPlaywright } from "../mail-provider";
import { test } from "../playwright-test";
import {
  conversationWithSubject,
  openMail,
  openMailboxFromSidebar,
} from "./mail-test-helpers";

test.skip(
  isMicrosoftPlaywright(),
  "Multiple Gmail draft messages on one conversation are seeded in the Google emulator.",
);

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("preserves multiple server drafts without reply headers", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await conversationWithSubject(
    page,
    conversations,
    "Multiple Server Drafts",
  ).click();
  const editors = page.getByRole("textbox", { name: "Email message" });
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toContainText("First saved reply");
  await expect(editors.nth(1)).toContainText("Second saved reply");
  await editors.nth(0).fill("Independent first edit");
  await expect(
    page.getByText("First saved reply", { exact: true }),
  ).toHaveCount(0);
  await expect(editors.nth(1)).toContainText("Second saved reply");

  await page
    .locator('[data-thread-message-id="msg_playwright_multi_draft_parent"]')
    .getByRole("button", { name: "Forward", exact: true })
    .click();
  await expect(editors).toHaveCount(3);
  await expect(editors.nth(0)).toContainText("Independent first edit");
  await expect(editors.nth(1)).toContainText("Second saved reply");

  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .nth(0)
    .click();
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toContainText("Second saved reply");
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .nth(0)
    .click();
  // Only the forward is left; each discard removed just its own draft.
  await expect(editors).toHaveCount(1);
  await expect(
    page.getByText("Second saved reply", { exact: true }),
  ).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "discarded-server-drafts");
});

test("preserves multiple server drafts without a sent parent", async ({
  page,
}, testInfo) => {
  const { conversations } = await openMail(page);
  await openMailboxFromSidebar(page, "Drafts");
  await conversationWithSubject(
    page,
    conversations,
    "Drafts Without Parent",
  ).click();
  const editors = page.getByRole("textbox", { name: "Email message" });
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toContainText("First saved reply");
  await expect(editors.nth(1)).toContainText("Second saved reply");
  await editors.nth(0).fill("Independent first edit");
  await expect(
    page.getByText("First saved reply", { exact: true }),
  ).toHaveCount(0);
  await expect(editors.nth(1)).toContainText("Second saved reply");
  await capturePlaywrightCheckpoint(page, testInfo, "draft-only-composers");
});
