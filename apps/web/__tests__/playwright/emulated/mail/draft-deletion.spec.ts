import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { conversationWithSubject, openMail } from "./mail-test-helpers";

test("updates the draft indicator after deletion and retains remaining drafts", async ({
  page,
}, testInfo) => {
  // Keep background sync from repairing a stale list during this assertion.
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
  await page.route("**/mail**", async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
  await discard.click();
  await expect(
    page.getByText("Failed to discard draft", { exact: true }),
  ).toBeVisible();
  await expect(discard).toBeVisible();
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await page.unroute("**/mail**");
  const refreshedThread = page.waitForResponse(async (response) => {
    if (!response.url().includes("/api/threads/thr_draft_indicator?"))
      return false;
    const body = await response.json();
    return body.thread?.messages.length === 2;
  });
  await discard.click();
  await refreshedThread;
  await expect(discardButtons).toHaveCount(1);
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(discardButtons).toHaveCount(0);
  await expect(row.getByText("Draft", { exact: true })).toHaveCount(0);
  await capturePlaywrightCheckpoint(page, testInfo, "deleted-draft-indicator");
});
