import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { getEmailAccountId } from "../account-test-helpers";
import {
  chooseSignupIntent,
  getSignupIntentState,
  resetOnboardingTestState,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

test.beforeEach(async () => {
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  await resetOnboardingTestState();
});

test("email app users skip the AI setup and go from the survey to picking a plan", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);

  await page.goto(`/${emailAccountId}/onboarding?step=intent`);
  await capturePlaywrightCheckpoint(page, testInfo, "signup-intent-step");
  await chooseSignupIntent(page, "Email app");

  await expect(
    page.getByRole("heading", { name: "What do you do?" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Founder", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "11-100 people", exact: true })
    .click();
  await page.getByRole("button", { name: "GitHub", exact: true }).click();

  await expect(page).toHaveURL(/\/welcome-upgrade(?:\?.*)?$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "email-app-upgrade");
  expect(await getSignupIntentState()).toEqual({
    completed: true,
    signupIntent: "MAIL_CLIENT",
  });
});

test("opening mail without a plan sends users to pick one", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);

  await page.goto(`/${emailAccountId}/mail`);

  await expect(page).toHaveURL(/\/welcome-upgrade(?:\?.*)?$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "mail-without-plan");
});
