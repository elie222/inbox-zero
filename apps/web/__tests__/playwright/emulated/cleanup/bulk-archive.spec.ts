import { expect, test, type Page } from "@playwright/test";
import {
  CLEANUP_ARCHIVE_THREAD_ID,
  CLEANUP_KEEP_THREAD_ID,
  cleanUpFixture,
  type CleanupFixture,
  openCleanupFeature,
  prepareCleanupFixture,
  restoreCleanupThreads,
} from "./cleanup-test-helpers";

let fixture: CleanupFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = undefined;
  fixture = await prepareCleanupFixture(page);
  await restoreCleanupThreads(page, fixture.emailAccountId, [
    CLEANUP_ARCHIVE_THREAD_ID,
    CLEANUP_KEEP_THREAD_ID,
  ]);
});

test.afterEach(async () => {
  if (fixture) await cleanUpFixture(fixture);
});

test("archives only selected senders from a category", async ({ page }) => {
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await stubMailboxSync(page, fixture.emailAccountId);
  await openCleanupFeature(page, fixture, "bulk-archive");
  await expect(page.getByRole("heading", { name: "Bulk Archive" })).toBeVisible(
    { timeout: 60_000 },
  );

  const newsletterCard = page
    .locator('[role="button"]')
    .filter({ has: page.getByRole("heading", { name: "Newsletter" }) });
  await newsletterCard.click();

  await expect(
    page.getByText("2 of 2 selected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Cleanup Keep" }).click();
  await expect(
    page.getByText("1 of 2 selected", { exact: true }),
  ).toBeVisible();

  await newsletterCard.getByRole("button", { name: "Archive 1 of 2" }).click();
  await expect(page.getByText("Archived 1!", { exact: true })).toBeVisible({
    timeout: 120_000,
  });

  await openCleanupFeature(page, fixture, "mail");
  const conversations = page.getByRole("listbox", { name: "Conversations" });
  await expect(conversations).toBeVisible({ timeout: 120_000 });
  await expect(
    conversations.getByText("Cleanup Category Archive Candidate", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    conversations.getByText("Cleanup Category Keep Candidate", { exact: true }),
  ).toBeVisible();
});

function stubMailboxSync(page: Page, emailAccountId: string) {
  return page.route("**/api/mobile/mailbox-sync", (route) =>
    route.fulfill({
      body: JSON.stringify({
        accountId: emailAccountId,
        cursor: "playwright-cleanup-sync",
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages: [],
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
}
