import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";
const STRIPE_EMULATOR_URL = process.env.PLAYWRIGHT_STRIPE_BASE_URL;

export type PremiumBillingState = {
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeTrialConvertedAt: Date | null;
  tier: string | null;
};

/** Returns the signed-in user's billing row, or null before any checkout. */
export async function getPremiumBillingState() {
  return withClient(async (client) => {
    const result = await client.query<PremiumBillingState>(
      `SELECT p."stripeSubscriptionId",
              p."stripeSubscriptionStatus",
              p."stripeTrialConvertedAt",
              p.tier::text AS tier
       FROM "User" u
       INNER JOIN "Premium" p ON p.id = u."premiumId"
       WHERE u.email = $1`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    return result.rows[0] ?? null;
  });
}

/**
 * Returns the account to the pre-purchase state on both sides, so each test
 * starts from a user who has never opened Stripe checkout.
 */
export async function resetBillingState() {
  await withClient(async (client) => {
    const result = await client.query<{ premiumId: string | null }>(
      `SELECT "premiumId" FROM "User" WHERE email = $1`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    const premiumId = result.rows[0]?.premiumId;
    if (!premiumId) return;

    await client.query(`DELETE FROM "Payment" WHERE "premiumId" = $1`, [
      premiumId,
    ]);
    await client.query(
      `UPDATE "User" SET "premiumId" = NULL WHERE email = $1`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    await client.query(`DELETE FROM "Premium" WHERE id = $1`, [premiumId]);
  });

  const response = await fetch(emulatorUrl("/__emulator/reset"), {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Could not reset the Stripe emulator: ${response.status}`);
  }
}

/**
 * Ends the trial the way Stripe does, then settles the first real invoice with
 * the requested outcome.
 */
export async function endStripeTrial(
  subscriptionId: string,
  outcome: "paid" | "failed",
) {
  const response = await fetch(
    emulatorUrl(`/__emulator/subscriptions/${subscriptionId}/end-trial`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome }),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not end the emulated trial: ${response.status}`);
  }
}

/** Clicks a tier's call to action and pays on Stripe's hosted checkout page. */
export async function payOnStripeCheckout(page: Page, tierName: string) {
  await page.locator(`button[aria-describedby="${tierName}"]`).click();

  // Production builds refuse to send the browser to a plain-http external
  // origin, which is correct for real traffic because Stripe's checkout page is
  // https, but it means the emulator's page cannot be reached by following the
  // app's redirect. Requiring the session to exist keeps the regression this
  // covers: the upgrade-page defect created no session and went to /login.
  const checkoutUrl = await waitForCheckoutSessionUrl();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto(checkoutUrl);
  await page.getByRole("button", { name: "Pay and subscribe" }).click();
}

/**
 * The first positive invoice is recorded by the same webhook sequence that
 * would record a paid conversion, so waiting for it settles the sequence
 * before asserting that no conversion was recorded.
 */
export async function getFirstPositivePaymentStatus() {
  return withClient(async (client) => {
    const result = await client.query<{ status: string }>(
      `SELECT pay.status
       FROM "User" u
       INNER JOIN "Payment" pay ON pay."premiumId" = u."premiumId"
       WHERE u.email = $1 AND pay.amount > 0
       ORDER BY pay."createdAt"
       LIMIT 1`,
      [PLAYWRIGHT_TEST_EMAIL],
    );
    return result.rows[0]?.status ?? null;
  });
}

export async function waitForTrialingSubscription() {
  await expect
    .poll(getPremiumBillingState, { timeout: 60_000 })
    .toMatchObject({ stripeSubscriptionStatus: "trialing" });

  const state = await getPremiumBillingState();
  const subscriptionId = state?.stripeSubscriptionId;
  if (!subscriptionId) throw new Error("The trial has no subscription id");
  return subscriptionId;
}

async function waitForCheckoutSessionUrl() {
  let url: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          emulatorUrl("/__emulator/checkout-sessions/latest"),
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

function emulatorUrl(path: string) {
  if (!STRIPE_EMULATOR_URL) {
    throw new Error("PLAYWRIGHT_STRIPE_BASE_URL is not configured");
  }
  return `${STRIPE_EMULATOR_URL}${path}`;
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
