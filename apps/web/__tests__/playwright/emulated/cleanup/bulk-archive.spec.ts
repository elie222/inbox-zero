import { expect, test } from "@playwright/test";
import { openMail } from "../mail/mail-test-helpers";
import {
  CLEANUP_ARCHIVE_THREAD_ID,
  CLEANUP_KEEP_THREAD_ID,
  cleanUpFixture,
  type CleanupFixture,
  openCleanupFeature,
  prepareCleanupFixture,
  restoreCleanupThreads,
} from "./cleanup-test-helpers";

let fixture: CleanupFixture;

test.beforeEach(async ({ page }) => {
  fixture = await prepareCleanupFixture(page);
  await restoreCleanupThreads(page, fixture.emailAccountId, [
    CLEANUP_ARCHIVE_THREAD_ID,
    CLEANUP_KEEP_THREAD_ID,
  ]);
});

test.afterEach(async () => {
  await cleanUpFixture(fixture);
});

test("archives only selected senders from a category", async ({ page }) => {
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
  await expect(page.getByText("Archived 1!", { exact: true })).toBeVisible();

  const { conversations } = await openMail(page);
  await expect(
    conversations.getByText("Cleanup Category Archive Candidate", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    conversations.getByText("Cleanup Category Keep Candidate", { exact: true }),
  ).toBeVisible();
});
