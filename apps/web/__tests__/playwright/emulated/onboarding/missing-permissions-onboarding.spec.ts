import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  openControlOnboarding,
  resetOnboardingTestState,
  revokeGmailScopes,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

let restoreScope: (() => Promise<unknown>) | undefined;

test.beforeEach(async () => {
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  await restoreScope?.();
  restoreScope = undefined;
  await resetOnboardingTestState();
});

test("asks to reconnect at the next step when Gmail access is missing", async ({
  page,
}, testInfo) => {
  await openControlOnboarding(page);

  restoreScope = await revokeGmailScopes();

  await page.getByRole("button", { name: "Founder", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: /We are missing permissions/ }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Reconnect account" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding\?step=/);
  await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(0);

  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "onboarding-missing-permissions",
  );
});
