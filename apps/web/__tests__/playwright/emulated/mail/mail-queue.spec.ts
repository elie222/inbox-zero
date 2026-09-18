import { expect } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { test } from "../playwright-test";

test("inspects an account's engine queue", async ({ page }, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/debug`);
  await page.getByRole("link", { name: "Mail queue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mail queue", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("No actions match this status.")).toBeVisible();
  await expect(page.getByText("Pending actions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connection" })).toBeVisible();
  await capturePlaywrightCheckpoint(page, testInfo, "mail-queue-empty");
});
