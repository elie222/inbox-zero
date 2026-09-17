import { expect, type Page } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import { getEmailAccountId } from "../account-test-helpers";
import {
  getPremiumBillingState,
  resetBillingState,
} from "../billing/billing-test-helpers";
import {
  resetOnboardingTestState,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

const STRIPE_EMULATOR_URL = process.env.PLAYWRIGHT_STRIPE_BASE_URL;

test.beforeEach(async () => {
  await resetBillingState();
  await setupOnboardingTestState();
});

test.afterEach(async () => {
  await resetOnboardingTestState();
  await resetBillingState();
});

test("control arm opens onboarding on the first step with no paywall", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  await page.goto(`/${emailAccountId}/onboarding`);
  await expect(
    page.getByRole("heading", { name: "Your inbox, automatically sorted" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/onboarding`));
  await capturePlaywrightCheckpoint(page, testInfo, "control-first-step");
  expect(await getPremiumBillingState()).toBeNull();
});

test("paywall-first arm shows pricing, then onboarding after payment, then setup", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);

  const loadedSignedInUser = page.waitForResponse(
    (response) =>
      response.url().includes("/api/user/me") && response.status() === 200,
    { timeout: 60_000 },
  );
  await page.goto(`/${emailAccountId}/onboarding?paywallFirst=true`);
  await expect(page).toHaveURL(/\/welcome-upgrade\?returnTo=onboarding$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible({ timeout: 60_000 });
  await loadedSignedInUser;
  await capturePlaywrightCheckpoint(page, testInfo, "paywall-pricing-first");

  await page.locator('button[aria-describedby="Starter"]').click();
  // Dev builds follow the app's redirect to the emulated checkout page;
  // production builds refuse the plain-http origin, so fall back to opening it.
  const checkoutUrl = await waitForCheckoutSessionUrl();
  await page
    .waitForURL(checkoutUrl, { timeout: 10_000 })
    .catch(() => page.goto(checkoutUrl));
  await expect(
    page.getByRole("button", { name: "Pay and subscribe" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(page, testInfo, "paywall-stripe-checkout");
  await page.getByRole("button", { name: "Pay and subscribe" }).click();

  // Checkout returns to onboarding rather than setup, keeping the conversion
  // params the setup page would otherwise have recorded.
  await page.waitForURL(
    new RegExp(
      `/${emailAccountId}/onboarding\\?conversion_event=trial_started&conversion_event_id=`,
    ),
    { timeout: 60_000 },
  );
  await expect.poll(getPremiumBillingState, { timeout: 60_000 }).toMatchObject({
    stripeSubscriptionStatus: "trialing",
  });
  await expect(
    page.getByRole("heading", { name: "Your inbox, automatically sorted" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "paywall-onboarding-after-payment",
  );

  // A paying user re-entering the paywall arm stays in onboarding.
  await page.goto(`/${emailAccountId}/onboarding?paywallFirst=true&step=who`);
  await expect(
    page.getByRole("heading", { name: "What do you do?" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/onboarding`));

  await completeOnboardingFromWhoStep(page);

  await expect(page).toHaveURL(/\/setup(?:\?.*)?$/, { timeout: 60_000 });
  await expect(page.getByText("Set up your Personal Assistant")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("There was an error")).toHaveCount(0);
  await capturePlaywrightCheckpoint(
    page,
    testInfo,
    "paywall-setup-after-onboarding",
  );
});

async function waitForCheckoutSessionUrl() {
  if (!STRIPE_EMULATOR_URL) {
    throw new Error("PLAYWRIGHT_STRIPE_BASE_URL is not configured");
  }
  let url: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${STRIPE_EMULATOR_URL}/__emulator/checkout-sessions/latest`,
        );
        if (!response.ok) return null;
        url = ((await response.json()) as { url?: string }).url;
        return url ?? null;
      },
      { timeout: 60_000 },
    )
    .not.toBeNull();
  if (!url) throw new Error("The app created no Stripe checkout session");
  return url;
}

async function completeOnboardingFromWhoStep(page: Page) {
  await page.getByRole("button", { name: "Founder", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What's the size of your company?" }),
  ).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole("button", { name: "11-100 people", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "How did you hear about Inbox Zero?" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How do you want your inbox organized?",
    }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Should we draft replies for you?" }),
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
}
