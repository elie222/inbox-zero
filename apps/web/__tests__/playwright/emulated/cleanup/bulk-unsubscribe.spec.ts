import { expect, test } from "@playwright/test";
import {
  CLEANUP_BLOCK_THREAD_ID,
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
    CLEANUP_BLOCK_THREAD_ID,
  ]);
});

test.afterEach(async () => {
  if (fixture) await cleanUpFixture(fixture);
});

test("blocks a selected sender and surfaces it in Auto Archive", async ({
  page,
}) => {
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await openCleanupFeature(page, fixture, "bulk-unsubscribe");
  await expect(
    page.getByRole("heading", { name: "Bulk Unsubscriber" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Unhandled/ }).click();
  await page.getByRole("menuitem", { name: "All" }).click();

  const senderRow = page
    .getByRole("row")
    .filter({ hasText: "cleanup-block@example.com" });
  await expect(senderRow).toContainText("Cleanup Weekly", { timeout: 60_000 });

  await senderRow.getByRole("link", { name: "Block" }).click();
  await expect(
    page.getByText("Sender blocked. Future emails will be archived."),
  ).toBeVisible();

  await page.getByRole("button", { name: /All/ }).click();
  await page.getByRole("menuitem", { name: "Auto Archive" }).click();
  await expect(senderRow).toBeVisible();
  await expect(senderRow.getByRole("link", { name: "Block" })).toBeVisible();
});
