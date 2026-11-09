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
  // the next one, so wait for it first. The browser can stop reading a server
  // action's response once it has the result, leaving its body unreadable to
  // page.waitForResponse, so read the bodies here before the page gets them.
  let firstStepChecked = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      return route.fallback();
    }
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("hasAllPermissions")) firstStepChecked = true;
    await route.fulfill({ response, body });
  });
  await openControlOnboarding(page);
  await expect.poll(() => firstStepChecked, { timeout: 60_000 }).toBe(true);
  await page.unrouteAll({ behavior: "wait" });

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
