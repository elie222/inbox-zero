import { expect, type Route } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  clearWorkflowMailboxDrafts,
  conversationWithSubject,
  openMail,
  readReplyThreadMessages,
  toggleMailLayout,
} from "./mail-test-helpers";

test("marks a conversation as a draft as soon as a reply is typed", async ({
  page,
}, testInfo) => {
  // Neither a provider save nor a sync can put the draft in the list, so only
  // the local draft can show it.
  await page.route("**/api/mobile/mailbox-sync", (route) => route.abort());
  const { conversations, emailAccountId } = await openMail(page);
  await clearWorkflowMailboxDrafts(page);
  if (
    !(await page.getByText("Nothing selected", { exact: true }).isVisible())
  ) {
    await toggleMailLayout(page);
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
  const abortProviderSaves = async (route: Route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  };
  await page.route("**/mail**", abortProviderSaves);

  await message.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Email message" });
  await editor.fill(`A reply that is only local. ${testInfo.retry}`);

  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "local-draft-badge");

  // After a reload only this device's store holds the draft, and the thread
  // stays closed, so the list has to mark it from the store. The closed
  // composer saves nothing, and aborted page-load actions would fail the test.
  await page.unroute("**/mail**", abortProviderSaves);
  await expect(async () => {
    const reloaded = await openMail(page);
    const reloadedRow = conversationWithSubject(
      page,
      reloaded.conversations,
      "Reply Workflow Message",
    );
    await reloadedRow.scrollIntoViewIfNeeded();
    await expect(reloadedRow.getByText("Draft", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  }).toPass({ timeout: 60_000 });
  await expect(editor).toHaveCount(0);
  // Had the reply reached the mailbox, its own Draft label could have marked
  // the row; this proves the mark came from the local store.
  const mailboxDrafts = (
    await readReplyThreadMessages(page, emailAccountId)
  ).filter((message) => message.labelIds?.includes("DRAFT"));
  expect(mailboxDrafts).toHaveLength(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "local-draft-badge-after-reload",
  );
});
