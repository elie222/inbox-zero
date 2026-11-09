import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { isMicrosoftPlaywright } from "../mail-provider";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  openControlOnboarding,
  resetOnboardingTestState,
  revokeGmailScopes,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

let restoreScope: (() => Promise<unknown>) | undefined;

test.beforeEach(async () => {
  restoreScope = undefined;
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  try {
    await restoreScope?.();
  } finally {
    restoreScope = undefined;
    await resetOnboardingTestState();
  }
});

test("asks to reconnect at the next step when Gmail access is missing", async ({
  page,
}, testInfo) => {
  test.skip(
    isMicrosoftPlaywright(),
    "Revokes Gmail scopes; the Outlook check reads the profile instead.",
  );

  // The step the user lands on runs its own permissions check. Revoking before
  // that check returns would show the reconnect screen on this step instead of
  // the next one, so wait for it first.
  const firstStepCheck = page.waitForResponse(
    async (response) =>
      response.request().method() === "POST" &&
      !!response.request().headers()["next-action"] &&
      // Bodies of other actions can be gone after a navigation; skip those.
      (await response.text().catch(() => "")).includes("hasAllPermissions"),
  );
  await Promise.all([firstStepCheck, openControlOnboarding(page)]);

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
