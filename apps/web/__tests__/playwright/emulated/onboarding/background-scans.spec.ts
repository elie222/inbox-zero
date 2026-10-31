import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import Redis from "ioredis";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { isMicrosoftPlaywright } from "../mail-provider";
import { capturePlaywrightCheckpoint } from "../playwright-evidence";
import {
  chooseSignupIntent,
  getSignupIntentState,
  resetOnboardingTestState,
  setupOnboardingTestState,
} from "./onboarding-test-helpers";

test.beforeEach(setupOnboardingTestState);
test.afterEach(resetOnboardingTestState);

test("Continue works while the background statistics request is still pending", async ({
  page,
}, testInfo) => {
  const emailAccountId = await getEmailAccountId(page);
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route("**/api/user/stats/load", async (route) => {
    started.resolve();
    await release.promise;
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: '{"error":"rate limited"}',
    });
  });

  try {
    await page.goto(`/${emailAccountId}/onboarding?step=intent`);
    await chooseSignupIntent(page, "Both");
    await expect(
      page.getByRole("heading", { name: "Your inbox, automatically sorted" }),
    ).toBeVisible();
    await started.promise;
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A chat that runs your email" }),
    ).toBeVisible({ timeout: 5000 });
    expect(await getSignupIntentState()).toEqual({
      completed: false,
      signupIntent: "BOTH",
    });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "continue-during-background-scan",
    );
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("Gmail throttling cannot block saving Both or navigating onboarding", async ({
  page,
}, testInfo) => {
  test.skip(isMicrosoftPlaywright(), "Seeds a Gmail rate-limit state.");
  const emailAccountId = await getEmailAccountId(page);
  await withUnanalyzedAccount(emailAccountId, async (redis) => {
    await redis.set(
      `email-provider-rate-limit:${emailAccountId}`,
      JSON.stringify({
        provider: "google",
        retryAt: new Date(Date.now() + 120_000).toISOString(),
        detectedAt: new Date().toISOString(),
        source: "onboarding-regression-test",
      }),
      "EX",
      120,
    );

    // The first onboarding step starts persona analysis.
    await page.goto(`/${emailAccountId}/onboarding`);
    await expect
      .poll(() => getPersonaAnalysisStatus(page, emailAccountId))
      .not.toBe("idle");
    await page.goto(`/${emailAccountId}/onboarding?step=intent`);
    await chooseSignupIntent(page, "Both");
    await expect(
      page.getByRole("heading", { name: "Your inbox, automatically sorted" }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A chat that runs your email" }),
    ).toBeVisible({ timeout: 5000 });
    await expect
      .poll(() => getPersonaAnalysisStatus(page, emailAccountId))
      .toBe("cooldown");
    expect(await getSignupIntentState()).toEqual({
      completed: false,
      signupIntent: "BOTH",
    });
    await capturePlaywrightCheckpoint(
      page,
      testInfo,
      "onboarding-with-gmail-throttled",
    );
  });
});

async function getPersonaAnalysisStatus(page: Page, emailAccountId: string) {
  const response = await page.request.get("/api/user/persona", {
    headers: { "X-Email-Account-ID": emailAccountId },
  });
  return (await response.json()).analysisStatus;
}

async function withUnanalyzedAccount(
  emailAccountId: string,
  run: (redis: Redis) => Promise<void>,
) {
  if (!process.env.REDIS_URL)
    throw new Error("This regression needs the isolated test Redis URL");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const redis = new Redis(process.env.REDIS_URL);
  await client.connect();
  const previous = await client.query(
    'SELECT "personaAnalysis" FROM "EmailAccount" WHERE id=$1',
    [emailAccountId],
  );
  try {
    await client.query(
      'UPDATE "EmailAccount" SET "personaAnalysis"=NULL WHERE id=$1',
      [emailAccountId],
    );
    await redis.del(`persona-analysis:${emailAccountId}`);
    await run(redis);
  } finally {
    await client.query(
      'UPDATE "EmailAccount" SET "personaAnalysis"=$2 WHERE id=$1',
      [emailAccountId, previous.rows[0].personaAnalysis],
    );
    await redis.del(
      `persona-analysis:${emailAccountId}`,
      `email-provider-rate-limit:${emailAccountId}`,
    );
    redis.disconnect();
    await client.end();
  }
}
