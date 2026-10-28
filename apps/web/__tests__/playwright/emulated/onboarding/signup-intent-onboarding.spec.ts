import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { getEmailAccountId } from "../account-test-helpers";
import {
  getPremiumBillingState,
  resetBillingState,
} from "../billing/billing-test-helpers";
import {
  chooseSignupIntent,
  getSignupIntentState,
  resetOnboardingTestState,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

test.beforeEach(async () => {
  await resetBillingState();
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  await resetOnboardingTestState();
  await resetBillingState();
});

test("email app users get a short intro and land in mail without the paywall", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);

  await page.goto(`/${emailAccountId}/onboarding?step=intent`);
  await capturePlaywrightCheckpoint(page, testInfo, "signup-intent-step");
  await chooseSignupIntent(page, "Email app");

  await expect(
    page.getByRole("heading", { name: "Meet your new email app" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-app-step");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/mail`), {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("listbox", { name: "Conversations" }),
  ).toBeVisible({ timeout: 60_000 });
  expect(await getSignupIntentState()).toEqual({
    completed: true,
    signupIntent: "MAIL_CLIENT",
  });
  expect(await getPremiumBillingState()).toBeNull();
});

test("the upgrade page lets users continue free with the email app", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);

  await page.goto("/welcome-upgrade");
  await page
    .getByRole("button", { name: "Continue for free", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/mail`), {
    timeout: 60_000,
  });
  await capturePlaywrightCheckpoint(page, testInfo, "upgrade-continue-free");
  expect(await getSignupIntentState()).toEqual({
    completed: true,
    signupIntent: "MAIL_CLIENT",
  });
});
