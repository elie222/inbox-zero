import { expect, test, type Page } from "@playwright/test";
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
  test.setTimeout(360_000);
  if (!fixture) throw new Error("Cleanup fixture was not initialized");
  await openCleanupFeature(page, fixture, "bulk-unsubscribe");
  await expect(
    page.getByRole("heading", { name: "Bulk Unsubscriber" }),
  ).toBeVisible();

  await selectNewsletterFilter(page, "Unhandled", "All");

  const senderRow = page
    .getByRole("row")
    .filter({ hasText: "cleanup-block@example.com" });
  await expect(senderRow).toContainText("Cleanup Weekly", { timeout: 60_000 });

  await senderRow.getByRole("link", { name: "Block" }).click();
  await expect(
    page.getByText("Sender blocked. Future emails will be archived."),
  ).toBeVisible({ timeout: 120_000 });

  await selectNewsletterFilter(page, "All", "Auto Archive");
  await expect(senderRow).toBeVisible({ timeout: 120_000 });
  await expect(senderRow.getByRole("link", { name: "Block" })).toBeVisible({
    timeout: 60_000,
  });
});

async function selectNewsletterFilter(
  page: Page,
  currentFilter: string,
  nextFilter: string,
) {
  const trigger = page.getByRole("button", {
    name: new RegExp(currentFilter),
  });
  const option = page.getByRole("menuitem", { name: nextFilter });

  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    try {
      await option.waitFor({ state: "visible", timeout: 10_000 });
      await option.click();
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.keyboard.press("Escape");
    }
  }
}
