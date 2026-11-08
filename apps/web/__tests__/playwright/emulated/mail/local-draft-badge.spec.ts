import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("marks a conversation as a draft as soon as a reply is typed", async ({
  page,
}, testInfo) => {
  // Neither a provider save nor a sync can put the draft in the list, so only
  // the local draft can show it.
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
    "Reply Workflow Message",
  );
  await expect(row.getByText("Draft", { exact: true })).toHaveCount(0);
  await row.click();
  const message = page.locator(
    '[data-thread-message-id="msg_playwright_reply"]',
  );
  await expect(message).toBeVisible({ timeout: 60_000 });
  await page.route("**/mail**", async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });

  await message.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Email message" });
  await editor.fill(`A reply that is only local. ${testInfo.retry}`);

  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "local-draft-badge");
});
