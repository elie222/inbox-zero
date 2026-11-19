import { expect } from "@playwright/test";
import { test } from "../playwright-test";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  endStripeTrial,
  getFirstPositivePaymentStatus,
  getPremiumBillingState,
  grantDefaultPlan,
  payOnStripeCheckout,
  resetBillingState,
  waitForTrialingSubscription,
} from "./billing-test-helpers";

const STARTER_TIER = "Starter";
// The helpers read the database directly, so they see the stored column value
// rather than the Prisma enum name: STARTER_ANNUALLY is `@map("BUSINESS_ANNUALLY")`.
const STARTER_ANNUALLY_TIER_COLUMN = "BUSINESS_ANNUALLY";

test.beforeEach(async () => {
  await resetBillingState();
});

test.afterEach(async () => {
  await resetBillingState();
  await grantDefaultPlan();
});

test("starts a trial from the post-onboarding upgrade page", async ({
  page,
}) => {
  // The upgrade page sends signed-out visitors to /login. It can only tell the
  // difference by loading the current user, so a page that never asks is a page
  // that turns paying customers away.
  const loadedSignedInUser = page.waitForResponse(
    (response) =>
      response.url().includes("/api/user/me") && response.status() === 200,
    { timeout: 60_000 },
  );

  await page.goto("/welcome-upgrade");
  await expect(
    page.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible({ timeout: 60_000 });
  await loadedSignedInUser;

  await capturePlaywrightCheckpoint(page, test.info(), "welcome-upgrade");

  await payOnStripeCheckout(page, STARTER_TIER);

  await expect(page).toHaveURL(/\/setup(?:\?.*)?$/, { timeout: 60_000 });
  await expect.poll(getPremiumBillingState, { timeout: 60_000 }).toMatchObject({
    stripeSubscriptionStatus: "trialing",
    tier: STARTER_ANNUALLY_TIER_COLUMN,
  });

  await page.goto("/premium");
  await expect(
    page.locator(`button[aria-describedby="${STARTER_TIER}"]`),
  ).toHaveText("Current plan", { timeout: 60_000 });

  // The same plan on the other billing interval is offered as a plan change.
  await page.getByRole("radio", { name: "Monthly" }).click();
  await expect(
    page.locator(`button[aria-describedby="${STARTER_TIER}"]`),
  ).toHaveText("Switch to this plan");
  await capturePlaywrightCheckpoint(
    page,
    test.info(),
    "billing-interval-switch",
  );
});

test("a desktop checkout finishes in the browser and the app moves on", async ({
  context,
  page,
}) => {
  // The desktop shell exposes this bridge; checkout from it opens in the
  // system browser, which is a separate window from the app.
  await context.addInitScript(() => {
    Object.assign(window, { inboxZeroDesktop: { startAuth: async () => {} } });
  });

  await page.goto("/welcome-upgrade");
  await expect(
    page.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible({ timeout: 60_000 });

  const browser = await context.newPage();
  await browser.goto("/welcome-upgrade");
  await expect(
    browser.getByRole("heading", { name: "Start your 7-day FREE trial" }),
  ).toBeVisible({ timeout: 60_000 });
  await payOnStripeCheckout(browser, STARTER_TIER);

  await expect(browser).toHaveURL(/\/checkout-complete(?:\?.*)?$/, {
    timeout: 60_000,
  });
  await expect(
    browser.getByRole("heading", { name: "You're all set" }),
  ).toBeVisible({ timeout: 60_000 });
  await capturePlaywrightCheckpoint(
    browser,
    test.info(),
    "desktop-checkout-complete",
  );

  // The seeded user picked no signup intent, so the app opens the assistant.
  await expect(page).toHaveURL(/\/automation(?:\?.*)?$/, { timeout: 60_000 });
  expect(await getPremiumBillingState()).toMatchObject({
    stripeSubscriptionStatus: "trialing",
  });
});

test("records the paid conversion once the first invoice is paid", async ({
  page,
}) => {
  await page.goto("/premium");
  await payOnStripeCheckout(page, STARTER_TIER);
  const subscriptionId = await waitForTrialingSubscription();

  await endStripeTrial(subscriptionId, "paid");

  await expect
    .poll(getPremiumBillingState, { timeout: 60_000 })
    .toMatchObject({ stripeSubscriptionStatus: "active" });
  await expect
    .poll(
      async () => (await getPremiumBillingState())?.stripeTrialConvertedAt,
      {
        timeout: 60_000,
      },
    )
    .not.toBeNull();
});

test("does not record a paid conversion when the first invoice fails", async ({
  page,
}) => {
  await page.goto("/premium");
  await payOnStripeCheckout(page, STARTER_TIER);
  const subscriptionId = await waitForTrialingSubscription();

  // Stripe flips the subscription to active before it knows the card will be
  // declined. Treating that transition as revenue is what inflates conversion.
  await endStripeTrial(subscriptionId, "failed");

  await expect
    .poll(getPremiumBillingState, { timeout: 60_000 })
    .toMatchObject({ stripeSubscriptionStatus: "past_due" });
  await expect
    .poll(getFirstPositivePaymentStatus, { timeout: 60_000 })
    .not.toBeNull();
  expect((await getPremiumBillingState())?.stripeTrialConvertedAt).toBeNull();
});
