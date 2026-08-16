import { expect, test } from "@playwright/test";
import {
  cleanUpFixture,
  type CleanupFixture,
  openCleanupFeature,
  prepareCleanupFixture,
} from "./cleanup-test-helpers";

let fixture: CleanupFixture;

test.beforeEach(async ({ page }) => {
  fixture = await prepareCleanupFixture(page);
});

test.afterEach(async () => {
  await cleanUpFixture(fixture);
});

test("shows seeded traffic and updates the reporting granularity", async ({
  page,
}) => {
  await openCleanupFeature(page, fixture, "stats");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  const onboardingDialog = page.getByRole("dialog", {
    name: "Welcome to email analytics",
  });
  await expect(onboardingDialog).toBeVisible();
  await onboardingDialog.getByRole("button", { name: "Get Started" }).click();

  await expect(
    page.getByText("analytics-sender@example.com", { exact: true }).first(),
  ).toBeVisible({ timeout: 60_000 });

  await expect(
    page.getByText("analytics-recipient@example.com", { exact: true }).first(),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Group by week" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Day" }).click();
  await expect(
    page.getByRole("button", { name: "Group by day" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Last month/ }).click();
  await page.getByText("Last week", { exact: true }).click();
  await expect(page.getByRole("button", { name: /Last week/ })).toBeVisible();
  await expect(
    page.getByText("analytics-sender@example.com", { exact: true }).first(),
  ).toBeVisible({ timeout: 60_000 });
});
