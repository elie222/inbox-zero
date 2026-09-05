import { expect } from "@playwright/test";
import { Client } from "pg";
import { test } from "../playwright-test";
import { getEmailAccountId } from "../account-test-helpers";

test("opens Assistant without rules or a viewed-onboarding cookie", async ({
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
  await expect(page).toHaveURL(new RegExp(`/${emailAccountId}/assistant$`));
  await expect(page.getByTestId("chat-input")).toBeVisible();

  await page.goto(`/${emailAccountId}/assistant?onboarding=true`);
  await expect(page.getByTestId("chat-input")).toBeVisible();
});
