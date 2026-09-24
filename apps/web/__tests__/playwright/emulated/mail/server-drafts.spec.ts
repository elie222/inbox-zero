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
  await capturePlaywrightCheckpoint(page, testInfo, "multiple-server-drafts");

  await page
    .locator('[data-thread-message-id="msg_playwright_multi_draft_parent"]')
    .getByRole("button", { name: "Forward", exact: true })
    .click();
  await expect(editors).toHaveCount(3);
  await expect(editors.nth(0)).toContainText("Independent first edit");
  await expect(editors.nth(1)).toContainText("Second saved reply");

  const pendingDiscards = [
    Promise.withResolvers<void>(),
    Promise.withResolvers<void>(),
  ];
  let discards = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (
      request.headers()["next-action"] &&
      (body.includes("msg_playwright_multi_draft_first") ||
        body.includes("msg_playwright_multi_draft_second")) &&
      !body.includes("messageHtml")
    ) {
      await pendingDiscards[discards++].promise;
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .nth(0)
    .click();
  await expect(editors).toHaveCount(2);
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .nth(0)
    .click();
  await expect(editors).toHaveCount(1);
  await expect.poll(() => discards).toBe(1);
  pendingDiscards[0].resolve();
  await expect(editors).toHaveCount(2);
  await expect.poll(() => discards).toBe(2);
  pendingDiscards[1].resolve();
  await expect(editors).toHaveCount(3);
  await expect(editors.nth(0)).toContainText("Independent first edit");
  await expect(editors.nth(1)).toContainText("Second saved reply");
  await capturePlaywrightCheckpoint(page, testInfo, "restored-server-drafts");
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
