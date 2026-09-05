import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";
import { markAssistantOnboardingViewed } from "./chat-test-helpers";

test("routes first-time Assistant visitors through onboarding", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const rules = await client.query(
      'SELECT id FROM "Rule" WHERE "emailAccountId" = $1',
      [emailAccountId],
    );
    expect(rules.rows).toHaveLength(0);
  } finally {
    await client.end();
  }
  await page.context().clearCookies({ name: "viewed_assistant_onboarding" });

  await page.goto(`/${emailAccountId}/assistant`);
  await expect(page).toHaveURL(
    (url) => url.pathname === `/${emailAccountId}/onboarding`,
  );
  await expect(
    page.getByRole("heading", { name: "Your inbox, automatically sorted" }),
  ).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeHidden();

  await page.goto(`/${emailAccountId}/assistant?onboarding=true`);
  await expect(page).toHaveURL(
    (url) => url.pathname === `/${emailAccountId}/onboarding`,
  );
  await expect(
    page.getByRole("heading", { name: "Your inbox, automatically sorted" }),
  ).toBeVisible();
});

test("opens Assistant after onboarding has been completed", async ({
  page,
}) => {
  const emailAccountId = await getEmailAccountId(page);
  await markAssistantOnboardingViewed(page);
  await page.goto(`/${emailAccountId}/assistant`);
  await expect(page).toHaveURL(
    (url) => url.pathname === `/${emailAccountId}/assistant`,
  );
  await expect(page.getByTestId("chat-input")).toBeVisible();
});
