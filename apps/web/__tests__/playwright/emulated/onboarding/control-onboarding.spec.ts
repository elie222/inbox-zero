import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import {
  getPersistedOnboardingState,
  openControlOnboarding,
  resetOnboardingTestState,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

test.beforeEach(async () => {
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  await resetOnboardingTestState();
});

test("completes account setup and persists onboarding choices", async ({
  page,
}) => {
  await openControlOnboarding(page);

  await page.getByRole("button", { name: "Founder", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What's the size of your company?" }),
  ).toBeVisible({ timeout: 60_000 });

  await page
    .getByRole("button", { name: "11-100 people", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "How did you hear about Inbox Zero?",
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How do you want your inbox organized?",
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Should we draft replies for you?",
    }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Yes, please", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Custom rules", exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Invite your team", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Labels are ready", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(/\/welcome-upgrade(?:\?.*)?$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible();

  await expect
    .poll(getPersistedOnboardingState, { timeout: 30_000 })
    .toMatchObject({
      completed: true,
      draftRepliesEnabled: true,
      role: "Founder",
      surveyCompanySize: 50,
      surveyRole: "Founder",
      surveySource: "github",
    });
  expect(
    (await getPersistedOnboardingState())?.systemRuleCount,
  ).toBeGreaterThan(0);
});
