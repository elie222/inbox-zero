import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { getEmailAccount } from "../account-test-helpers";
import { playwrightMailProvider } from "../mail-provider";

const PLAYWRIGHT_TEST_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-test@gmail.com";
const APP_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3100";
const authorizeUrl =
  playwrightMailProvider === "microsoft"
    ? /\/oauth2\/v2\.0\/authorize(?:\?.*)?$/
    : /\/o\/oauth2\/v2\/auth(?:\?.*)?$/;

test(`${playwrightMailProvider} emulator signs in and creates an app account`, async ({
  page,
}) => {
  await page.goto("/login?next=%2Fwelcome-redirect%3Fforce%3Dtrue", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

  const signInPayload = await page.evaluate(async (provider) => {
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider,
        callbackURL: "/welcome-redirect?force=true",
        errorCallbackURL: "/login/error",
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth sign-in failed with status ${response.status}`);
    }

    return (await response.json()) as { url: string };
  }, playwrightMailProvider);

  await page.goto(signInPayload.url);
  await expect(page).toHaveURL(authorizeUrl);
  await page.getByRole("button", { name: PLAYWRIGHT_TEST_EMAIL }).click();

  await expect
    .poll(() => page.url(), { timeout: 30_000 })
    .toContain(APP_BASE_URL);

  await markOnboardingComplete(PLAYWRIGHT_TEST_EMAIL);
  const emailAccount = await getEmailAccount(page);
  expect(emailAccount.email).toBe(PLAYWRIGHT_TEST_EMAIL);

  const authStatePath = process.env.PLAYWRIGHT_AUTH_FILE;
  if (!authStatePath) throw new Error("PLAYWRIGHT_AUTH_FILE is not configured");
  await page.context().storageState({ path: authStatePath });
});

async function markOnboardingComplete(email: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const result = await client.query(
        `UPDATE "User"
         SET "completedOnboardingAt" = CURRENT_TIMESTAMP
         WHERE email = $1`,
        [email],
      );
      if (result.rowCount === 1) {
        const account = await client.query(
          `UPDATE "EmailAccount"
           SET "behaviorProfile" = '{}'::jsonb,
               "personaAnalysis" = '{}'::jsonb,
               "writingStyle" = 'Playwright seeded writing style'
           WHERE email = $1`,
          [email],
        );
        if (account.rowCount === 1) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for the OAuth user row for ${email}`);
  } finally {
    await client.end();
  }
}
